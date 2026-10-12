"""ReturnRide backend test suite.

Covers: auth (register/login/blocked), maps (reverse/search/route), rides/match,
bookings full lifecycle (OTP visibility, transitions, start/complete/pay/rate,
cancellation reason), and admin (stats/logs, 403 for non-admin).
"""
import os
import uuid
import time
import random
import pytest
import requests


def _fresh_phone():
    # 10-digit phone unique across parallel workers
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


# ---------- helpers / fixtures ----------
def _login(payload):
    r = requests.post(f"{API}/auth/login", json=payload, timeout=15)
    assert r.status_code == 200, f"login failed for {payload['phone']}: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def passenger_token():
    return _login(PASSENGER)


@pytest.fixture(scope="session")
def driver_token():
    return _login(DRIVER)


@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN)


# ---------- health ----------
def test_health():
    r = requests.get(f"{API}/", timeout=10)
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# ---------- auth ----------
class TestAuth:
    def test_register_new_passenger(self):
        phone = _fresh_phone()
        body = {"phone": phone, "password": "test1234", "name": "TEST_" + uuid.uuid4().hex[:6], "role": "passenger"}
        r = requests.post(f"{API}/auth/register", json=body, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "access_token" in j and j.get("user", {}).get("role") == "passenger"
        assert "password_hash" not in j["user"]

    def test_login_seeded_passenger(self):
        r = requests.post(f"{API}/auth/login", json=PASSENGER, timeout=15)
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_login_wrong_password_401(self):
        r = requests.post(f"{API}/auth/login", json={"phone": PASSENGER["phone"], "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_blocked_user_returns_403(self, admin_token):
        """Register a fresh user, admin blocks them, login must return 403."""
        phone = _fresh_phone()
        reg = requests.post(f"{API}/auth/register", json={
            "phone": phone, "password": "test1234", "name": "TEST_blocked", "role": "passenger"}, timeout=15)
        assert reg.status_code == 200
        uid = reg.json()["user"]["id"]
        # admin block
        pr = requests.patch(f"{API}/admin/users/{uid}", headers=_hdr(admin_token),
                            json={"status": "blocked", "blocked_reason": "TEST"}, timeout=15)
        assert pr.status_code == 200
        # login should 403
        lr = requests.post(f"{API}/auth/login", json={"phone": phone, "password": "test1234"}, timeout=15)
        assert lr.status_code == 403, f"expected 403 got {lr.status_code} {lr.text}"


# ---------- maps ----------
class TestMaps:
    def test_reverse_geocode(self, passenger_token):
        r = requests.get(f"{API}/maps/reverse", params={"lat": PICKUP["lat"], "lng": PICKUP["lng"]},
                         headers=_hdr(passenger_token), timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "address" in j and "lat" in j and "lng" in j

    def test_search(self, passenger_token):
        r = requests.get(f"{API}/maps/search", params={"q": "Wai"},
                         headers=_hdr(passenger_token), timeout=15)
        assert r.status_code == 200
        assert "results" in r.json()

    def test_route(self, passenger_token):
        body = {"origin_lat": PICKUP["lat"], "origin_lng": PICKUP["lng"],
                "dest_lat": DROP["lat"], "dest_lng": DROP["lng"]}
        r = requests.post(f"{API}/maps/route", json=body, headers=_hdr(passenger_token), timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert "geometry" in j and isinstance(j["geometry"], list) and len(j["geometry"]) >= 2
        assert "distance_km" in j and "duration_min" in j
        assert j["distance_km"] > 0


# ---------- rides matching ----------
class TestMatching:
    def test_match_returns_candidates(self, passenger_token):
        body = {"pickup": PICKUP, "drop": DROP}
        r = requests.post(f"{API}/rides/match", json=body, headers=_hdr(passenger_token), timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "matches" in j and "corridor_km" in j
        assert len(j["matches"]) >= 1, "expected seeded matches"
        m = j["matches"][0]
        assert "id" in m and "estimated_fare" in m and "segment_km" in m


# ---------- full lifecycle ----------
class TestBookingLifecycle:
    """Register fresh passenger to avoid 'already have active booking' 409s."""

    @pytest.fixture(scope="class")
    def fresh_passenger(self):
        phone = _fresh_phone()
        body = {"phone": phone, "password": "test1234", "name": "TEST_pax_" + uuid.uuid4().hex[:5], "role": "passenger"}
        r = requests.post(f"{API}/auth/register", json=body, timeout=15)
        assert r.status_code == 200
        return {"token": r.json()["access_token"], "id": r.json()["user"]["id"], "phone": phone}

    @pytest.fixture(scope="class")
    def booking_ctx(self, fresh_passenger):
        # get a match
        mr = requests.post(f"{API}/rides/match", json={"pickup": PICKUP, "drop": DROP},
                           headers=_hdr(fresh_passenger["token"]), timeout=20)
        assert mr.status_code == 200
        matches = mr.json()["matches"]
        assert matches, "need at least one match to book"
        m = matches[0]
        # create booking
        body = {
            "ride_id": m["id"], "pickup": PICKUP, "drop": DROP,
            "distance_km": m["segment_km"], "duration_min": 30.0,
            "route_geometry": [[PICKUP["lat"], PICKUP["lng"]], [DROP["lat"], DROP["lng"]]],
        }
        br = requests.post(f"{API}/bookings", json=body, headers=_hdr(fresh_passenger["token"]), timeout=20)
        assert br.status_code == 200, br.text
        bk = br.json()
        assert "otp" in bk and len(str(bk["otp"])) == 4, "passenger must receive 4-digit OTP"
        return {"passenger": fresh_passenger, "booking": bk, "otp": bk["otp"], "ride_id": m["id"]}

    def test_01_booking_created_otp_visible_to_passenger(self, booking_ctx):
        assert booking_ctx["otp"] and len(str(booking_ctx["otp"])) == 4

    def test_02_get_booking_driver_no_otp(self, booking_ctx, driver_token):
        bid = booking_ctx["booking"]["id"]
        r = requests.get(f"{API}/bookings/{bid}", headers=_hdr(driver_token), timeout=15)
        assert r.status_code == 200
        assert "otp" not in r.json(), "driver must not see otp"

    def test_03_get_booking_passenger_has_otp(self, booking_ctx):
        bid = booking_ctx["booking"]["id"]
        r = requests.get(f"{API}/bookings/{bid}", headers=_hdr(booking_ctx["passenger"]["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json().get("otp") == booking_ctx["otp"]

    def test_04_get_booking_admin_no_otp(self, booking_ctx, admin_token):
        bid = booking_ctx["booking"]["id"]
        r = requests.get(f"{API}/bookings/{bid}", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200
        assert "otp" not in r.json(), "admin must not see otp"

    def test_05_transition_accepted(self, booking_ctx, driver_token):
        bid = booking_ctx["booking"]["id"]
        r = requests.post(f"{API}/bookings/{bid}/status", json={"status": "accepted"},
                          headers=_hdr(driver_token), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "accepted"

    def test_06_transition_en_route(self, booking_ctx, driver_token):
        bid = booking_ctx["booking"]["id"]
        r = requests.post(f"{API}/bookings/{bid}/status", json={"status": "en_route"},
                          headers=_hdr(driver_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "en_route"

    def test_07_transition_arrived(self, booking_ctx, driver_token):
        bid = booking_ctx["booking"]["id"]
        r = requests.post(f"{API}/bookings/{bid}/status", json={"status": "arrived"},
                          headers=_hdr(driver_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "arrived"

    def test_08_direct_in_progress_via_status_400(self, booking_ctx, driver_token):
        bid = booking_ctx["booking"]["id"]
        r = requests.post(f"{API}/bookings/{bid}/status", json={"status": "in_progress"},
                          headers=_hdr(driver_token), timeout=15)
        assert r.status_code == 400
        assert "otp" in r.text.lower() or "start" in r.text.lower()

    def test_09_start_wrong_otp_400(self, booking_ctx, driver_token):
        bid = booking_ctx["booking"]["id"]
        wrong = "0000" if booking_ctx["otp"] != "0000" else "1111"
        r = requests.post(f"{API}/bookings/{bid}/start", json={"otp": wrong},
                          headers=_hdr(driver_token), timeout=15)
        assert r.status_code == 400
        assert "left" in r.text.lower() or "wrong" in r.text.lower()

    def test_10_start_correct_otp_in_progress(self, booking_ctx, driver_token):
        bid = booking_ctx["booking"]["id"]
        r = requests.post(f"{API}/bookings/{bid}/start", json={"otp": booking_ctx["otp"]},
                          headers=_hdr(driver_token), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "in_progress"

    def test_11_complete_ride(self, booking_ctx, driver_token):
        bid = booking_ctx["booking"]["id"]
        # send driver at drop for proximity guard
        body = {"driver_lat": DROP["lat"], "driver_lng": DROP["lng"]}
        r = requests.post(f"{API}/bookings/{bid}/complete", json=body,
                          headers=_hdr(driver_token), timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["status"] == "completed"
        assert isinstance(j.get("final_fare"), (int, float)) and j["final_fare"] > 0
        assert j.get("fare_breakdown") and isinstance(j["fare_breakdown"], dict)

    def test_12_pay_cash(self, booking_ctx):
        bid = booking_ctx["booking"]["id"]
        r = requests.post(f"{API}/bookings/{bid}/pay", json={"mode": "cash"},
                          headers=_hdr(booking_ctx["passenger"]["token"]), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("payment_status") == "paid"
        assert r.json().get("payment_mode") == "cash"

    def test_13_rate_ride(self, booking_ctx):
        bid = booking_ctx["booking"]["id"]
        r = requests.post(f"{API}/bookings/{bid}/rate", json={"stars": 5},
                          headers=_hdr(booking_ctx["passenger"]["token"]), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("rating") == 5


# ---------- cancellation ----------
class TestCancellation:
    def test_cancel_requires_reason(self, admin_token, driver_token):
        # create a fresh passenger + booking, cancel without reason -> 400
        phone = _fresh_phone()
        reg = requests.post(f"{API}/auth/register", json={
            "phone": phone, "password": "test1234", "name": "TEST_cancel", "role": "passenger"}, timeout=15).json()
        tok = reg["access_token"]
        mr = requests.post(f"{API}/rides/match", json={"pickup": PICKUP, "drop": DROP},
                           headers=_hdr(tok), timeout=20).json()
        m = mr["matches"][0]
        body = {"ride_id": m["id"], "pickup": PICKUP, "drop": DROP,
                "distance_km": m["segment_km"], "duration_min": 30.0,
                "route_geometry": [[PICKUP["lat"], PICKUP["lng"]], [DROP["lat"], DROP["lng"]]]}
        br = requests.post(f"{API}/bookings", json=body, headers=_hdr(tok), timeout=15).json()
        bid = br["id"]
        # no reason
        r1 = requests.post(f"{API}/bookings/{bid}/status", json={"status": "cancelled"},
                           headers=_hdr(tok), timeout=15)
        assert r1.status_code == 400
        # with reason
        r2 = requests.post(f"{API}/bookings/{bid}/status",
                           json={"status": "cancelled", "reason": "TEST changed plans"},
                           headers=_hdr(tok), timeout=15)
        assert r2.status_code == 200
        assert r2.json()["status"] == "cancelled"


# ---------- admin ----------
class TestAdmin:
    def test_stats(self, admin_token):
        r = requests.get(f"{API}/admin/stats", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "kpis" in j and "total" in j["kpis"] and "revenue" in j["kpis"]

    def test_logs(self, admin_token):
        r = requests.get(f"{API}/admin/logs", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200
        assert "logs" in r.json()

    def test_non_admin_stats_403(self, passenger_token):
        r = requests.get(f"{API}/admin/stats", headers=_hdr(passenger_token), timeout=15)
        assert r.status_code == 403

    def test_non_admin_logs_403(self, driver_token):
        r = requests.get(f"{API}/admin/logs", headers=_hdr(driver_token), timeout=15)
        assert r.status_code == 403
