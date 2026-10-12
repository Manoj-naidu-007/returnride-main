"""First-boot seed: settings, admin, demo drivers/passenger, landmarks, demo rides."""
import os
from datetime import timedelta

import httpx
from passlib.context import CryptContext

from sqlalchemy import func, select

from db import DEFAULT_SETTINGS, SessionLocal
from models import AppSettings, Ride, User, Village
from utils import haversine_km, now_utc

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

# A rural corridor in Maharashtra, India (Shirwal -> Wai) used for demo data.
ORIGIN = {"lat": 18.0876, "lng": 74.0256, "address": "Shirwal Bus Stand, Maharashtra"}
DEST = {"lat": 17.9509, "lng": 73.8918, "address": "Wai Market, Maharashtra"}

DEMO_DRIVERS = [
    {"phone": "9000000001", "name": "Ramesh Patil", "vehicle_model": "Mahindra Bolero", "vehicle_number": "MH11 AB 1234"},
    {"phone": "9000000002", "name": "Suresh Jadhav", "vehicle_model": "Bajaj Auto", "vehicle_number": "MH11 CD 5678"},
    {"phone": "9000000003", "name": "Lata Shinde", "vehicle_model": "Maruti Eeco", "vehicle_number": "MH11 EF 9012", "gender": "female"},
]


async def _osrm_route(o, d):
    coords = f"{o['lng']},{o['lat']};{d['lng']},{d['lat']}"
    url = f"https://router.project-osrm.org/route/v1/driving/{coords}"
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(url, params={"overview": "full", "geometries": "geojson"},
                            headers={"User-Agent": "ReturnRide/1.0"})
            r.raise_for_status()
            rt = r.json()["routes"][0]
            geom = [[p[1], p[0]] for p in rt["geometry"]["coordinates"]]
            return geom, round(rt["distance"] / 1000, 2), round(rt["duration"] / 60, 1)
    except Exception:
        dist = haversine_km(o["lat"], o["lng"], d["lat"], d["lng"])
        return [[o["lat"], o["lng"]], [d["lat"], d["lng"]]], round(dist, 2), round(dist / 40 * 60, 1)


async def run_seed():
    """Idempotent first-boot seed: settings, admin, demo passenger/drivers, landmarks, demo rides."""
    async with SessionLocal() as s:
        # 1. settings
        if not (await s.execute(select(AppSettings).where(AppSettings.id == "fare"))).scalar_one_or_none():
            s.add(AppSettings(id="fare", **DEFAULT_SETTINGS))

        # 2. admin
        admin_phone = "9999999999"
        if not (await s.execute(select(User).where(User.phone == admin_phone))).scalar_one_or_none():
            s.add(User(
                phone=admin_phone, password_hash=pwd.hash(os.environ.get("ADMIN_DEFAULT_PASSWORD", "admin1234")),
                name="Admin", role="admin", status="active", gender=None, rating=5.0, rating_count=0,
                verified=True, wallet_balance=0, created_at=now_utc()))

        # 3. demo passenger
        if not (await s.execute(select(User).where(User.phone == "8000000001"))).scalar_one_or_none():
            s.add(User(
                phone="8000000001", password_hash=pwd.hash("demo1234"), name="Anita Kumar",
                role="passenger", status="active", gender="female", rating=5.0, rating_count=0,
                verified=True, wallet_balance=500.0, created_at=now_utc()))

        # 4. demo drivers
        drivers = []
        for d in DEMO_DRIVERS:
            existing = (await s.execute(select(User).where(User.phone == d["phone"]))).scalar_one_or_none()
            if existing:
                drivers.append(existing)
                continue
            drv = User(
                phone=d["phone"], password_hash=pwd.hash("demo1234"), name=d["name"],
                role="driver", status="active", gender=d.get("gender"),
                vehicle_model=d["vehicle_model"], vehicle_number=d["vehicle_number"],
                license_no="MH-DL-" + d["phone"][-4:], vehicle_rc_no="RC-" + d["phone"][-4:],
                rating=4.7, rating_count=12, verified=True, wallet_balance=0, created_at=now_utc())
            s.add(drv)
            drivers.append(drv)
        await s.flush()  # assigns ids

        # 5. route + landmarks
        geom, dist_km, dur_min = await _osrm_route(ORIGIN, DEST)
        if (await s.execute(select(func.count(Village.id)))).scalar_one() == 0:
            n = len(geom)
            # clamp indices: the offline fallback route has only 2 points
            mid1 = min(n - 1, max(1, n // 3))
            mid2 = min(n - 1, max(1, 2 * n // 3))
            picks = [
                ("Shirwal Bus Stand", "bus_stand", geom[0]),
                ("Khandala Temple", "temple", geom[mid1]),
                ("Surur Market", "market", geom[mid2]),
                ("Wai Market", "market", geom[-1]),
            ]
            s.add_all([Village(name=name, type=t, lat=pt[0], lng=pt[1], address=f"{name}, Maharashtra")
                       for name, t, pt in picks])

        # 6. demo active rides (one per driver) departing in the next few hours
        active_rides = (await s.execute(select(func.count(Ride.id)).where(Ride.status == "active"))).scalar_one()
        if active_rides == 0:
            for i, drv in enumerate(drivers):
                start = now_utc() + timedelta(hours=1 + i)
                s.add(Ride(
                    driver_id=drv.id, driver_name=drv.name,
                    vehicle_model=drv.vehicle_model, vehicle_number=drv.vehicle_number,
                    driver_rating=drv.rating or 4.7,
                    origin=ORIGIN, dest=DEST,
                    distance_km=dist_km, duration_min=dur_min, route_geometry=geom,
                    depart_start=start, depart_end=start + timedelta(hours=2),
                    seats_total=4, seats_available=4, fare_rate=None,
                    women_only=drv.gender == "female", recurring=False,
                    is_return=True, status="active", created_at=now_utc()))
        await s.commit()
