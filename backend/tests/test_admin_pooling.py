"""Tests for the new POOLING and ADMIN CONSOLE features."""
import os
import time
import random
import uuid
import pytest
import requests


def _fresh_phone():
    return "7" + str(int(time.time() * 1000))[-6:] + str(random.randint(100, 999))


BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

PASSENGER = {"phone": "8000000001", "password": "demo1234"}
DRIVER = {"phone": "9000000001", "password": "demo1234"}
ADMIN = {"phone": "9999999999", "password": "admin1234"}
PICKUP = {"lat": 18.0876, "lng": 74.0256, "address": "Shirwal"}
DROP = {"lat": 17.9509, "lng": 73.8918, "address": "Wai"}


def _login(payload):
    r = requests.post(f"{API}/auth/login", json=payload, timeout=15)
    assert r.status_code == 200, f"login {payload['phone']} -> {r.status_code} {r.text}"
    return r.json()["access_token"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="session")
def passenger_token():
    return _login(PASSENGER)


@pytest.fixture(scope="session")
def driver_token():
    return _login(DRIVER)


def _register_fresh_passenger():
    phone = _fresh_phone()
    r = requests.post(f"{API}/auth/register", json={
        "phone": phone, "password": "test1234",
        "name": "TEST_" + uuid.uuid4().hex[:6], "role": "passenger"}, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    return {"token": j["access_token"], "id": j["user"]["id"], "phone": phone}


# ---------- POOLING ----------
class TestPoolingMatch:
    def test_match_returns_pool_fields(self, passenger_token):
        r = requests.post(f"{API}/rides/match", json={"pickup": PICKUP, "drop": DROP},
                          headers=_hdr(passenger_token), timeout=20)
        assert r.status_code == 200, r.text
        matches = r.json().get("matches", [])
        assert matches, "expected at least one seeded match"
        m = matches[0]
        for k in ("estimated_fare", "estimated_fare_pooled", "pooled_savings", "co_riders"):
            assert k in m, f"missing {k} in match: {list(m.keys())}"
        assert m["estimated_fare_pooled"] < m["estimated_fare"], \
            f"pooled fare {m['estimated_fare_pooled']} should be less than {m['estimated_fare']}"
        # 12% discount expectation (allow rounding tolerance)
        expected = round(m["estimated_fare"] * 0.88, 2)
        assert abs(m["estimated_fare_pooled"] - expected) <= 1.0, \
            f"pooled fare {m['estimated_fare_pooled']} not close to 12% off (~{expected})"
        assert m["pooled_savings"] > 0
        assert isinstance(m["co_riders"], int)


class TestPoolingBooking:
    """Register two fresh passengers to book pooled vs non-pooled on the same ride."""

    def test_pooled_booking_has_discount(self):
        # user A - non-pooled
        a = _register_fresh_passenger()
        # user B - pooled
        b = _register_fresh_passenger()
        # match
        mr = requests.post(f"{API}/rides/match", json={"pickup": PICKUP, "drop": DROP},
                           headers=_hdr(a["token"]), timeout=20).json()
        assert mr["matches"], "need seeded match"
        m = mr["matches"][0]

        base = {
            "ride_id": m["id"], "pickup": PICKUP, "drop": DROP,
            "distance_km": m["segment_km"], "duration_min": 30.0,
            "route_geometry": [[PICKUP["lat"], PICKUP["lng"]], [DROP["lat"], DROP["lng"]]],
        }
        rA = requests.post(f"{API}/bookings", json={**base, "pooled": False},
                          headers=_hdr(a["token"]), timeout=15)
        assert rA.status_code == 200, rA.text
        bkA = rA.json()

        rB = requests.post(f"{API}/bookings", json={**base, "pooled": True},
                          headers=_hdr(b["token"]), timeout=15)
        assert rB.status_code == 200, rB.text
        bkB = rB.json()

        assert bkB["estimated_fare"] < bkA["estimated_fare"], \
            f"pooled fare {bkB['estimated_fare']} not < non-pooled {bkA['estimated_fare']}"
        fb = bkB.get("fare_breakdown") or {}
        assert "pool_discount" in fb, f"pool_discount missing in breakdown {fb}"
        assert fb["pool_discount"] > 0, f"pool_discount should be > 0, got {fb['pool_discount']}"
        # non-pooled breakdown either lacks or has 0 pool_discount
        fbA = bkA.get("fare_breakdown") or {}
        assert (fbA.get("pool_discount") or 0) == 0


# ---------- ADMIN AUTHZ ----------
class TestAdminAuthz:
    def test_passenger_cannot_access_admin_stats(self, passenger_token):
        assert requests.get(f"{API}/admin/stats", headers=_hdr(passenger_token), timeout=15).status_code == 403

    def test_driver_cannot_access_admin_users(self, driver_token):
        assert requests.get(f"{API}/admin/users", headers=_hdr(driver_token), timeout=15).status_code == 403

    def test_passenger_cannot_access_admin_bookings(self, passenger_token):
        assert requests.get(f"{API}/admin/bookings", headers=_hdr(passenger_token), timeout=15).status_code == 403

    def test_passenger_cannot_access_admin_settings(self, passenger_token):
        assert requests.get(f"{API}/admin/settings", headers=_hdr(passenger_token), timeout=15).status_code == 403


# ---------- ADMIN STATS ----------
class TestAdminStats:
    def test_stats_shape(self, admin_token):
        r = requests.get(f"{API}/admin/stats", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "kpis" in j
        for k in ("total", "completed", "cancelled", "ongoing", "pending", "revenue"):
            assert k in j["kpis"], f"kpi {k} missing"
        assert "bookings_per_day" in j and "revenue_per_day" in j and "status_split" in j


# ---------- ADMIN USERS: block flow ----------
class TestAdminUsers:
    def test_list_users_with_filters(self, admin_token):
        r = requests.get(f"{API}/admin/users?role=driver", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "users" in j and "total" in j
        # every returned user should be a driver
        for u in j["users"]:
            assert u.get("role") == "driver"

    def test_block_then_login_403_then_unblock_login_200(self, admin_token):
        fresh = _register_fresh_passenger()
        # login OK before block
        r0 = requests.post(f"{API}/auth/login", json={"phone": fresh["phone"], "password": "test1234"}, timeout=15)
        assert r0.status_code == 200

        # block
        rb = requests.patch(f"{API}/admin/users/{fresh['id']}", headers=_hdr(admin_token),
                            json={"status": "blocked", "blocked_reason": "TEST"}, timeout=15)
        assert rb.status_code == 200, rb.text
        assert rb.json()["status"] == "blocked"

        # blocked -> 403
        r1 = requests.post(f"{API}/auth/login",
                           json={"phone": fresh["phone"], "password": "test1234"}, timeout=15)
        assert r1.status_code == 403, f"expected 403 got {r1.status_code} {r1.text}"

        # unblock
        ru = requests.patch(f"{API}/admin/users/{fresh['id']}", headers=_hdr(admin_token),
                            json={"status": "active"}, timeout=15)
        assert ru.status_code == 200
        assert ru.json()["status"] == "active"

        # login OK again
        r2 = requests.post(f"{API}/auth/login",
                           json={"phone": fresh["phone"], "password": "test1234"}, timeout=15)
        assert r2.status_code == 200

    def test_role_change_and_reset_password(self, admin_token):
        fresh = _register_fresh_passenger()
        # role -> driver
        r1 = requests.patch(f"{API}/admin/users/{fresh['id']}", headers=_hdr(admin_token),
                            json={"role": "driver"}, timeout=15)
        assert r1.status_code == 200
        assert r1.json()["role"] == "driver"

        # verify true
        r2 = requests.patch(f"{API}/admin/users/{fresh['id']}", headers=_hdr(admin_token),
                            json={"verified": True}, timeout=15)
        assert r2.status_code == 200 and r2.json().get("verified") is True

        # reset password
        r3 = requests.patch(f"{API}/admin/users/{fresh['id']}", headers=_hdr(admin_token),
                            json={"reset_password": "newpass99"}, timeout=15)
        assert r3.status_code == 200

        # login with new password
        rl = requests.post(f"{API}/auth/login",
                           json={"phone": fresh["phone"], "password": "newpass99"}, timeout=15)
        assert rl.status_code == 200

    def test_soft_delete_user(self, admin_token):
        fresh = _register_fresh_passenger()
        r = requests.delete(f"{API}/admin/users/{fresh['id']}", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True


# ---------- ADMIN BOOKINGS ----------
class TestAdminBookings:
    def test_list_and_detail_and_force_cancel(self, admin_token):
        # create a fresh booking to have something to cancel
        fresh = _register_fresh_passenger()
        mr = requests.post(f"{API}/rides/match", json={"pickup": PICKUP, "drop": DROP},
                           headers=_hdr(fresh["token"]), timeout=20).json()
        m = mr["matches"][0]
        body = {"ride_id": m["id"], "pickup": PICKUP, "drop": DROP,
                "distance_km": m["segment_km"], "duration_min": 30.0,
                "route_geometry": [[PICKUP["lat"], PICKUP["lng"]], [DROP["lat"], DROP["lng"]]]}
        br = requests.post(f"{API}/bookings", json=body, headers=_hdr(fresh["token"]), timeout=15).json()
        bid = br["id"]

        # list
        r = requests.get(f"{API}/admin/bookings?status=requested",
                         headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200
        assert any(b["id"] == bid for b in r.json()["bookings"])

        # detail includes timeline + otp_result but no otp value
        rd = requests.get(f"{API}/admin/bookings/{bid}", headers=_hdr(admin_token), timeout=15)
        assert rd.status_code == 200
        jd = rd.json()
        assert "booking" in jd and "timeline" in jd
        assert "otp_result" in jd["booking"]
        assert "otp" not in jd["booking"], "admin must not see OTP value"

        # force-cancel
        rc = requests.post(f"{API}/admin/bookings/{bid}/cancel",
                           json={"reason": "TEST admin force cancel"},
                           headers=_hdr(admin_token), timeout=15)
        assert rc.status_code == 200, rc.text
        assert rc.json().get("ok") is True

        # cancelling again -> 400 already closed
        rc2 = requests.post(f"{API}/admin/bookings/{bid}/cancel",
                            json={"reason": "again"}, headers=_hdr(admin_token), timeout=15)
        assert rc2.status_code == 400


# ---------- ADMIN LOGS ----------
class TestAdminLogs:
    def test_list_and_filter(self, admin_token):
        r = requests.get(f"{API}/admin/logs?limit=20", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "logs" in j and "total" in j

    def test_export_csv(self, admin_token):
        r = requests.get(f"{API}/admin/logs/export", headers=_hdr(admin_token), timeout=20)
        assert r.status_code == 200
        assert "csv" in r.headers.get("content-type", "")
        assert "created_at" in r.text.splitlines()[0]


# ---------- ADMIN SETTINGS ----------
class TestAdminSettings:
    def test_get_and_put(self, admin_token):
        # snapshot current
        r0 = requests.get(f"{API}/admin/settings", headers=_hdr(admin_token), timeout=15)
        assert r0.status_code == 200
        current = r0.json()
        for k in ("base_fare", "rate_per_km", "return_discount",
                  "pool_discount", "corridor_km", "co2_per_km"):
            assert k in current, f"setting {k} missing"

        # update pool_discount and rate_per_km
        new_vals = {"pool_discount": 0.15, "rate_per_km": float(current["rate_per_km"]) + 0.01}
        r1 = requests.put(f"{API}/admin/settings", json=new_vals,
                          headers=_hdr(admin_token), timeout=15)
        assert r1.status_code == 200, r1.text
        j1 = r1.json()
        assert abs(float(j1["pool_discount"]) - 0.15) < 1e-6
        assert abs(float(j1["rate_per_km"]) - new_vals["rate_per_km"]) < 1e-6

        # GET reflects the new values
        r2 = requests.get(f"{API}/admin/settings", headers=_hdr(admin_token), timeout=15)
        assert r2.status_code == 200
        assert abs(float(r2.json()["pool_discount"]) - 0.15) < 1e-6

        # restore
        requests.put(f"{API}/admin/settings", json={
            "pool_discount": float(current["pool_discount"]),
            "rate_per_km": float(current["rate_per_km"])},
            headers=_hdr(admin_token), timeout=15)
