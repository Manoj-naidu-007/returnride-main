"""Shared helpers: serialization, geometry, fare math, OTP."""
import hashlib
import hmac
import math
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

JWT_SECRET = os.environ.get("JWT_SECRET", "returnride-dev-secret-change-me")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt
    return dt.isoformat()


def parse_id(value) -> int | None:
    """Parse an id coming from a URL/body. Returns None if it is not a valid positive integer."""
    try:
        v = int(str(value))
    except (TypeError, ValueError):
        return None
    return v if 0 < v < 2**63 else None


def like_escape(term: str) -> str:
    """Escape LIKE wildcards so user input is matched literally (use with escape='\\')."""
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


# ---------------------------------------------------------------- geometry ---
def haversine_km(lat1, lng1, lat2, lng2) -> float:
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def nearest_vertex_index(geometry, lat, lng):
    """geometry is a list of [lat, lng]. Return (min_dist_km, index)."""
    best_d, best_i = float("inf"), -1
    for i, pt in enumerate(geometry):
        d = haversine_km(lat, lng, pt[0], pt[1])
        if d < best_d:
            best_d, best_i = d, i
    return best_d, best_i


def point_on_corridor(geometry, lat, lng, corridor_km):
    d, i = nearest_vertex_index(geometry, lat, lng)
    return d <= corridor_km, d, i


# ------------------------------------------------------------------- fares ---
def compute_fare(distance_km, settings, is_return=False, pooled=False, promo=0.0):
    base = float(settings["base_fare"])
    rate = float(settings["rate_per_km"])
    distance_charge = rate * float(distance_km)
    subtotal = base + distance_charge
    return_disc = 0.0
    pool_disc = 0.0
    if is_return:
        return_disc = subtotal * float(settings["return_discount"])
    after_return = subtotal - return_disc
    if pooled:
        pool_disc = after_return * float(settings["pool_discount"])
    total = after_return - pool_disc - float(promo or 0.0)
    total = max(total, 0.0)
    breakdown = {
        "base_fare": round(base, 2),
        "distance_charge": round(distance_charge, 2),
        "subtotal": round(subtotal, 2),
        "return_discount": round(return_disc, 2),
        "pool_discount": round(pool_disc, 2),
        "promo": round(float(promo or 0.0), 2),
        "total": round(total, 2),
        "distance_km": round(float(distance_km), 2),
    }
    return round(total, 2), breakdown


def co2_saved_kg(distance_km, settings):
    return round(float(distance_km) * float(settings.get("co2_per_km", 0.12)), 2)


# --------------------------------------------------------------------- OTP ---
def gen_otp() -> str:
    return f"{secrets.randbelow(10000):04d}"


def hash_otp(otp: str) -> str:
    return hmac.new(JWT_SECRET.encode(), otp.encode(), hashlib.sha256).hexdigest()


def verify_otp(otp: str, otp_hash: str) -> bool:
    if not otp_hash:
        return False
    return hmac.compare_digest(hash_otp(otp), otp_hash)


# --------------------------------------------------------------- validation ---
def normalize_phone(phone: str) -> str | None:
    v = "".join(ch for ch in (phone or "").strip() if ch.isdigit())
    if 7 <= len(v) <= 15:
        return v
    return None


def valid_coord(lat, lng) -> bool:
    try:
        return -90 <= float(lat) <= 90 and -180 <= float(lng) <= 180
    except (TypeError, ValueError):
        return False
