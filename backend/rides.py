"""Rides: driver publishes a ride with a real route; corridor-based matching."""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from audit import log_action
from auth import get_current_user, require_role
from db import get_session, get_settings
from models import Booking, Ride, User
from utils import (compute_fare, haversine_km, nearest_vertex_index, now_utc,
                   parse_id, valid_coord)

router = APIRouter(prefix="/api/rides", tags=["rides"])


class Point(BaseModel):
    lat: float
    lng: float
    address: str = ""


class PublishIn(BaseModel):
    origin: Point
    dest: Point
    distance_km: float
    duration_min: float
    route_geometry: List[List[float]]
    depart_start: str
    depart_end: str
    seats_total: int = 3
    fare_rate: Optional[float] = None
    women_only: bool = False
    recurring: bool = False
    is_return: bool = True


class MatchIn(BaseModel):
    pickup: Point
    drop: Point
    depart_time: Optional[str] = None


def _parse(dt: str) -> datetime:
    d = datetime.fromisoformat(dt.replace("Z", "+00:00"))
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d


def along_route_km(geometry, i, j):
    if i > j:
        i, j = j, i
    total = 0.0
    for k in range(i, j):
        a, b = geometry[k], geometry[k + 1]
        total += haversine_km(a[0], a[1], b[0], b[1])
    return total


@router.post("")
async def publish(body: PublishIn, request: Request, user: User = Depends(require_role("driver")),
                  s: AsyncSession = Depends(get_session)):
    if not (valid_coord(body.origin.lat, body.origin.lng) and valid_coord(body.dest.lat, body.dest.lng)):
        raise HTTPException(400, "Invalid coordinates")
    if body.seats_total < 1 or body.seats_total > 6:
        raise HTTPException(400, "Seats must be 1-6")
    ride = Ride(
        driver_id=user.id,
        driver_name=user.name,
        vehicle_model=user.vehicle_model,
        vehicle_number=user.vehicle_number,
        driver_rating=user.rating if user.rating is not None else 5.0,
        origin=body.origin.model_dump(),
        dest=body.dest.model_dump(),
        distance_km=round(body.distance_km, 2),
        duration_min=round(body.duration_min, 1),
        route_geometry=body.route_geometry,
        depart_start=_parse(body.depart_start),
        depart_end=_parse(body.depart_end),
        seats_total=body.seats_total,
        seats_available=body.seats_total,
        fare_rate=body.fare_rate,
        women_only=body.women_only,
        recurring=body.recurring,
        is_return=body.is_return,
        status="active",
        created_at=now_utc(),
    )
    s.add(ride)
    await s.commit()
    await log_action("ride_published", actor_id=user.id, actor_role="driver",
                     entity_type="ride", entity_id=ride.id,
                     metadata={"origin": body.origin.address, "dest": body.dest.address}, request=request)
    return ride.to_dict()


@router.post("/match")
async def match(body: MatchIn, user: User = Depends(get_current_user),
                s: AsyncSession = Depends(get_session)):
    if not (valid_coord(body.pickup.lat, body.pickup.lng) and valid_coord(body.drop.lat, body.drop.lng)):
        raise HTTPException(400, "Invalid coordinates")
    settings = await get_settings()
    corridor = float(settings["corridor_km"])
    want_time = _parse(body.depart_time) if body.depart_time else None

    stmt = select(Ride).where(Ride.status == "active", Ride.seats_available > 0)
    if user.gender != "female":
        # men cannot see women-only rides
        stmt = stmt.where(Ride.women_only.is_(False))
    # insertion order (oldest first) keeps tie-breaking deterministic, as before
    candidates = (await s.execute(stmt.order_by(Ride.id).limit(300))).scalars().all()

    matches = []
    for ride in candidates:
        geom = ride.route_geometry or []
        if len(geom) < 2:
            continue
        d_pick, i_pick = nearest_vertex_index(geom, body.pickup.lat, body.pickup.lng)
        d_drop, i_drop = nearest_vertex_index(geom, body.drop.lat, body.drop.lng)
        if d_pick > corridor or d_drop > corridor:
            continue
        if i_pick >= i_drop:  # pickup must come before drop along the route
            continue
        seg_km = round(along_route_km(geom, i_pick, i_drop), 2)
        if seg_km <= 0:
            seg_km = round(haversine_km(body.pickup.lat, body.pickup.lng, body.drop.lat, body.drop.lng), 2)

        # scoring
        detour_score = max(0.0, 1.0 - (d_pick + d_drop) / (2 * corridor))  # closer to route = better
        rating_score = float((ride.driver_rating if ride.driver_rating is not None else 5.0)) / 5.0
        time_score = 1.0
        if want_time:
            ds, de = ride.depart_start, ride.depart_end
            if ds.tzinfo is None:
                ds = ds.replace(tzinfo=timezone.utc)
            if de.tzinfo is None:
                de = de.replace(tzinfo=timezone.utc)
            if ds <= want_time <= de:
                time_score = 1.0
            else:
                gap_min = min(abs((want_time - ds).total_seconds()), abs((want_time - de).total_seconds())) / 60
                time_score = max(0.0, 1.0 - gap_min / 120)
        score = round(0.5 * detour_score + 0.3 * time_score + 0.2 * rating_score, 3)

        est_fare, breakdown = compute_fare(seg_km, settings, is_return=ride.is_return, pooled=False)
        pooled_fare, pooled_breakdown = compute_fare(seg_km, settings, is_return=ride.is_return, pooled=True)
        out = ride.to_dict()
        out.update({
            "segment_km": seg_km,
            "pickup_detour_km": round(d_pick, 2),
            "drop_detour_km": round(d_drop, 2),
            "estimated_fare": est_fare,
            "estimated_fare_pooled": pooled_fare,
            "pooled_savings": round(est_fare - pooled_fare, 2),
            "co_riders": 0,
            "fare_breakdown": breakdown,
            "fare_breakdown_pooled": pooled_breakdown,
            "match_score": score,
        })
        matches.append(out)

    if matches:  # one grouped query instead of one COUNT per ride
        ids = [int(m["id"]) for m in matches]
        rows = await s.execute(
            select(Booking.ride_id, func.count(Booking.id))
            .where(Booking.ride_id.in_(ids),
                   Booking.status.in_(["requested", "accepted", "en_route", "arrived", "in_progress"]))
            .group_by(Booking.ride_id))
        counts = {str(rid): n for rid, n in rows.all()}
        for m in matches:
            m["co_riders"] = counts.get(m["id"], 0)

    matches.sort(key=lambda m: m["match_score"], reverse=True)
    return {"matches": matches, "corridor_km": corridor}


@router.get("/mine")
async def my_rides(user: User = Depends(require_role("driver")), s: AsyncSession = Depends(get_session)):
    docs = (await s.execute(select(Ride).where(Ride.driver_id == user.id)
                            .order_by(Ride.created_at.desc()).limit(100))).scalars().all()
    counts = {}
    if docs:
        rows = await s.execute(
            select(Booking.ride_id, func.count(Booking.id))
            .where(Booking.ride_id.in_([r.id for r in docs]), Booking.status != "cancelled")
            .group_by(Booking.ride_id))
        counts = {rid: n for rid, n in rows.all()}
    result = []
    for r in docs:
        item = r.to_dict()
        item["bookings_count"] = counts.get(r.id, 0)
        result.append(item)
    return {"rides": result}


@router.get("/{ride_id}")
async def get_ride(ride_id: str, user: User = Depends(get_current_user), s: AsyncSession = Depends(get_session)):
    rid = parse_id(ride_id)
    if rid is None:
        raise HTTPException(404, "Not found")
    ride = (await s.execute(select(Ride).where(Ride.id == rid))).scalar_one_or_none()
    if not ride:
        raise HTTPException(404, "Not found")
    return ride.to_dict()
