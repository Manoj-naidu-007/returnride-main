"""Bookings: full ride lifecycle with start-ride OTP, completion, fare, payment, rating."""
from datetime import timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from audit import log_action
from auth import get_current_user, require_role
from db import get_session, get_settings
from models import Booking, BookingEvent, Ride, User
from utils import (co2_saved_kg, compute_fare, gen_otp, hash_otp, haversine_km,
                   now_utc, parse_id, valid_coord, verify_otp)

router = APIRouter(prefix="/api/bookings", tags=["bookings"])

MAX_OTP_ATTEMPTS = 5
OTP_LOCK_MINUTES = 10
OTP_TTL_HOURS = 12

VALID_TRANSITIONS = {
    "requested": {"accepted", "rejected", "cancelled"},
    "accepted": {"en_route", "cancelled"},
    "en_route": {"arrived", "cancelled"},
    "arrived": {"in_progress", "cancelled"},
    "in_progress": {"completed"},
    "completed": set(),
    "cancelled": set(),
    "rejected": set(),
}
ACTIVE_STATES = {"requested", "accepted", "en_route", "arrived", "in_progress"}
OTP_VISIBLE_STATES = {"requested", "accepted", "en_route", "arrived"}


class Point(BaseModel):
    lat: float
    lng: float
    address: str = ""


class BookIn(BaseModel):
    ride_id: str
    pickup: Point
    drop: Point
    distance_km: float
    duration_min: float
    route_geometry: List[List[float]] = []
    pooled: bool = False


class StatusIn(BaseModel):
    status: str
    reason: Optional[str] = None


class StartIn(BaseModel):
    otp: str


class CompleteIn(BaseModel):
    driver_lat: Optional[float] = None
    driver_lng: Optional[float] = None
    override_reason: Optional[str] = None


class LocationIn(BaseModel):
    lat: float
    lng: float
    heading: Optional[float] = None


class PayIn(BaseModel):
    mode: str  # cash | upi | wallet | razorpay


class RateIn(BaseModel):
    stars: int
    comment: Optional[str] = None


def serialize(b: Booking, viewer: User) -> dict:
    out = b.to_dict()  # never includes otp / otp_hash
    if viewer.id == b.passenger_id and b.status in OTP_VISIBLE_STATES:
        out["otp"] = b.otp
    return out


def add_event(s: AsyncSession, booking_id: int, status: str, actor_id: int):
    """Queue a timeline event in the caller's transaction (committed with the booking change)."""
    s.add(BookingEvent(booking_id=booking_id, status=status, actor_id=actor_id, created_at=now_utc()))


async def free_seat(s: AsyncSession, ride_id: int):
    await s.execute(update(Ride).where(Ride.id == ride_id)
                    .values(seats_available=func.least(Ride.seats_available + 1, Ride.seats_total)))


@router.post("")
async def create_booking(body: BookIn, request: Request, user: User = Depends(require_role("passenger", "driver")),
                         s: AsyncSession = Depends(get_session)):
    if user.role != "passenger":
        raise HTTPException(403, "Only passengers can book")
    if not (valid_coord(body.pickup.lat, body.pickup.lng) and valid_coord(body.drop.lat, body.drop.lng)):
        raise HTTPException(400, "Invalid coordinates")
    ride_id = parse_id(body.ride_id)
    if ride_id is None:
        raise HTTPException(404, "Ride not available")
    ride = (await s.execute(select(Ride).where(Ride.id == ride_id))).scalar_one_or_none()
    if not ride or ride.status != "active":
        raise HTTPException(404, "Ride not available")
    if ride.seats_available < 1:
        raise HTTPException(400, "No seats available")

    existing = (await s.execute(select(Booking.id).where(
        Booking.passenger_id == user.id, Booking.status.in_(list(ACTIVE_STATES))).limit(1))).first()
    if existing:
        raise HTTPException(409, "You already have an active booking")

    settings = await get_settings()
    est_fare, breakdown = compute_fare(body.distance_km, settings,
                                       is_return=ride.is_return, pooled=body.pooled)
    otp = gen_otp()
    booking = Booking(
        ride_id=ride.id,
        driver_id=ride.driver_id,
        driver_name=ride.driver_name,
        vehicle_model=ride.vehicle_model,
        vehicle_number=ride.vehicle_number,
        passenger_id=user.id,
        passenger_name=user.name,
        passenger_phone=user.phone,
        pickup_point=body.pickup.model_dump(),
        drop_point=body.drop.model_dump(),
        distance_km=round(body.distance_km, 2),
        duration_min=round(body.duration_min, 1),
        route_geometry=body.route_geometry,
        pooled=body.pooled,
        is_return=ride.is_return,
        estimated_fare=est_fare,
        fare_breakdown=breakdown,
        status="requested",
        otp=otp,
        otp_hash=hash_otp(otp),
        otp_expires_at=now_utc() + timedelta(hours=OTP_TTL_HOURS),
        otp_attempts=0,
        payment_status="pending",
        co2_saved=co2_saved_kg(body.distance_km, settings),
        created_at=now_utc(),
    )
    s.add(booking)
    await s.flush()  # assigns booking.id
    add_event(s, booking.id, "requested", user.id)
    await s.commit()
    await log_action("booking_created", actor_id=user.id, actor_role="passenger",
                     entity_type="booking", entity_id=booking.id,
                     metadata={"ride_id": body.ride_id, "fare": est_fare}, request=request)
    return serialize(booking, user)


@router.get("/mine")
async def my_bookings(user: User = Depends(get_current_user), s: AsyncSession = Depends(get_session)):
    col = Booking.driver_id if user.role == "driver" else Booking.passenger_id
    docs = (await s.execute(select(Booking).where(col == user.id)
                            .order_by(Booking.created_at.desc()).limit(100))).scalars().all()
    return {"bookings": [serialize(d, user) for d in docs]}


@router.get("/incoming")
async def incoming(user: User = Depends(require_role("driver")), s: AsyncSession = Depends(get_session)):
    """Requested bookings on this driver's rides."""
    docs = (await s.execute(select(Booking).where(Booking.driver_id == user.id, Booking.status == "requested")
                            .order_by(Booking.created_at.desc()).limit(100))).scalars().all()
    return {"bookings": [serialize(d, user) for d in docs]}


async def _get_booking_for(s: AsyncSession, user: User, booking_id: str) -> Booking:
    bid = parse_id(booking_id)
    if bid is None:
        raise HTTPException(404, "Not found")
    doc = (await s.execute(select(Booking).where(Booking.id == bid))).scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Not found")
    if user.id not in (doc.passenger_id, doc.driver_id) and user.role != "admin":
        raise HTTPException(403, "Not your booking")
    return doc


@router.get("/{booking_id}")
async def get_booking(booking_id: str, user: User = Depends(get_current_user), s: AsyncSession = Depends(get_session)):
    doc = await _get_booking_for(s, user, booking_id)
    return serialize(doc, user)


@router.post("/{booking_id}/status")
async def change_status(booking_id: str, body: StatusIn, request: Request,
                        user: User = Depends(get_current_user), s: AsyncSession = Depends(get_session)):
    doc = await _get_booking_for(s, user, booking_id)
    cur = doc.status
    target = body.status
    if target == "in_progress":
        raise HTTPException(400, "Use /start with OTP to begin the ride")
    if target not in VALID_TRANSITIONS.get(cur, set()):
        raise HTTPException(400, f"Cannot move from {cur} to {target}")

    is_driver = user.id == doc.driver_id
    is_passenger = user.id == doc.passenger_id

    if target in ("accepted", "rejected", "en_route", "arrived"):
        if not is_driver:
            raise HTTPException(403, "Only the driver can do this")

    if target in ("cancelled", "rejected"):
        if target == "cancelled" and not body.reason:
            raise HTTPException(400, "A cancellation reason is required")

    if target == "accepted":
        # atomic seat reservation: the WHERE clause prevents overbooking under concurrency
        res = await s.execute(update(Ride).where(Ride.id == doc.ride_id, Ride.seats_available > 0)
                              .values(seats_available=Ride.seats_available - 1))
        if res.rowcount == 0:
            await s.rollback()
            raise HTTPException(400, "No seats available")

    doc.status = target
    if target == "arrived":
        doc.arrived_at = now_utc()
    if target in ("cancelled", "rejected"):
        # free the seat back if it was reserved
        if cur in ("accepted", "en_route", "arrived"):
            await free_seat(s, doc.ride_id)
        doc.cancelled_at = now_utc()
        doc.cancelled_by = "driver" if is_driver else ("passenger" if is_passenger else "admin")
        doc.cancel_reason = body.reason

    add_event(s, doc.id, target, user.id)
    await s.commit()
    await log_action(f"booking_{target}", actor_id=user.id, actor_role=user.role,
                     entity_type="booking", entity_id=booking_id,
                     metadata={"from": cur, "reason": body.reason}, request=request)
    return serialize(doc, user)


@router.post("/{booking_id}/start")
async def start_ride(booking_id: str, body: StartIn, request: Request,
                     user: User = Depends(require_role("driver")), s: AsyncSession = Depends(get_session)):
    doc = await _get_booking_for(s, user, booking_id)
    if user.id != doc.driver_id:
        raise HTTPException(403, "Only the driver can start the ride")
    if doc.status != "arrived":
        raise HTTPException(400, "Ride can only start after you have arrived")

    if doc.otp_locked_until and doc.otp_locked_until > now_utc():
        raise HTTPException(429, "Too many wrong attempts. Try again later.")
    if doc.otp_expires_at and doc.otp_expires_at < now_utc():
        raise HTTPException(400, "OTP expired. Ask the passenger to regenerate it.")

    if not verify_otp(body.otp.strip(), doc.otp_hash or ""):
        attempts = (doc.otp_attempts or 0) + 1
        doc.otp_attempts = attempts
        left = MAX_OTP_ATTEMPTS - attempts
        if attempts >= MAX_OTP_ATTEMPTS:
            doc.otp_locked_until = now_utc() + timedelta(minutes=OTP_LOCK_MINUTES)
            await s.commit()
            await log_action("otp_locked", actor_id=user.id, actor_role="driver", level="warn",
                             entity_type="booking", entity_id=booking_id, request=request)
            raise HTTPException(429, "Wrong OTP. Locked for 10 minutes.")
        await s.commit()
        await log_action("otp_failed", actor_id=user.id, actor_role="driver", level="warn",
                         entity_type="booking", entity_id=booking_id,
                         metadata={"attempts": attempts}, request=request)
        raise HTTPException(400, f"Wrong OTP, {left} attempt{'s' if left != 1 else ''} left")

    doc.status = "in_progress"
    doc.otp_verified_at = now_utc()
    doc.started_at = now_utc()
    add_event(s, doc.id, "in_progress", user.id)
    await s.commit()
    await log_action("otp_verified", actor_id=user.id, actor_role="driver",
                     entity_type="booking", entity_id=booking_id, request=request)
    await log_action("ride_started", actor_id=user.id, actor_role="driver",
                     entity_type="booking", entity_id=booking_id, request=request)
    return serialize(doc, user)


@router.post("/{booking_id}/otp/regenerate")
async def regenerate_otp(booking_id: str, user: User = Depends(get_current_user),
                         s: AsyncSession = Depends(get_session)):
    doc = await _get_booking_for(s, user, booking_id)
    if user.id != doc.passenger_id:
        raise HTTPException(403, "Only the passenger can regenerate the OTP")
    if doc.status not in OTP_VISIBLE_STATES:
        raise HTTPException(400, "OTP cannot be regenerated now")
    otp = gen_otp()
    doc.otp = otp
    doc.otp_hash = hash_otp(otp)
    doc.otp_expires_at = now_utc() + timedelta(hours=OTP_TTL_HOURS)
    doc.otp_attempts = 0
    doc.otp_locked_until = None
    await s.commit()
    return serialize(doc, user)


@router.post("/{booking_id}/location")
async def post_location(booking_id: str, body: LocationIn, user: User = Depends(require_role("driver")),
                        s: AsyncSession = Depends(get_session)):
    doc = await _get_booking_for(s, user, booking_id)
    if user.id != doc.driver_id:
        raise HTTPException(403, "Only the driver can post location")
    doc.driver_location = {"lat": body.lat, "lng": body.lng, "heading": body.heading,
                           "updated_at": now_utc().isoformat()}
    await s.commit()
    return {"ok": True}


@router.post("/{booking_id}/complete")
async def complete_ride(booking_id: str, body: CompleteIn, request: Request,
                        user: User = Depends(require_role("driver")), s: AsyncSession = Depends(get_session)):
    doc = await _get_booking_for(s, user, booking_id)
    if user.id != doc.driver_id:
        raise HTTPException(403, "Only the driver can complete the ride")
    if doc.status != "in_progress":
        raise HTTPException(400, "Ride is not in progress")

    # proximity guard: within 500m of drop OR an override reason
    if body.driver_lat is not None and body.driver_lng is not None:
        dist = haversine_km(body.driver_lat, body.driver_lng, doc.drop_point["lat"], doc.drop_point["lng"])
        if dist > 0.5 and not body.override_reason:
            raise HTTPException(400, "You are not near the drop point. Provide an override reason to complete.")

    settings = await get_settings()
    final_fare, breakdown = compute_fare(doc.distance_km, settings,
                                         is_return=doc.is_return, pooled=doc.pooled)
    doc.status = "completed"
    doc.final_fare = final_fare
    doc.fare_breakdown = breakdown
    doc.actual_distance_km = doc.distance_km
    doc.completed_at = now_utc()
    doc.co2_saved = co2_saved_kg(doc.distance_km, settings)
    if body.override_reason:
        doc.complete_override_reason = body.override_reason
    add_event(s, doc.id, "completed", user.id)
    await s.commit()
    await log_action("ride_completed", actor_id=user.id, actor_role="driver",
                     entity_type="booking", entity_id=booking_id,
                     metadata={"final_fare": final_fare}, request=request)
    return serialize(doc, user)


@router.post("/{booking_id}/pay")
async def pay(booking_id: str, body: PayIn, request: Request, user: User = Depends(get_current_user),
              s: AsyncSession = Depends(get_session)):
    doc = await _get_booking_for(s, user, booking_id)
    if doc.status != "completed":
        raise HTTPException(400, "Ride is not completed yet")
    if body.mode not in ("cash", "upi", "wallet", "razorpay"):
        raise HTTPException(400, "Invalid payment mode")
    if doc.payment_status == "paid":
        raise HTTPException(400, "Already paid")
    doc.payment_mode = body.mode
    doc.payment_status = "paid"
    doc.paid_at = now_utc()
    # demo wallet deduction (atomic, done in SQL)
    if body.mode == "wallet" and user.id == doc.passenger_id:
        await s.execute(update(User).where(User.id == user.id)
                        .values(wallet_balance=User.wallet_balance - float(doc.final_fare or 0)))
    await s.commit()
    await log_action("payment_paid", actor_id=user.id, actor_role=user.role,
                     entity_type="booking", entity_id=booking_id,
                     metadata={"mode": body.mode, "amount": float(doc.final_fare or 0)}, request=request)
    return serialize(doc, user)


@router.post("/{booking_id}/rate")
async def rate(booking_id: str, body: RateIn, request: Request, user: User = Depends(get_current_user),
               s: AsyncSession = Depends(get_session)):
    doc = await _get_booking_for(s, user, booking_id)
    if user.id != doc.passenger_id:
        raise HTTPException(403, "Only the passenger can rate")
    if doc.status != "completed":
        raise HTTPException(400, "You can only rate a completed ride")
    if not (1 <= body.stars <= 5):
        raise HTTPException(400, "Stars must be 1-5")
    doc.rating = body.stars
    doc.rating_comment = body.comment
    # update driver aggregate
    driver = (await s.execute(select(User).where(User.id == doc.driver_id).with_for_update())).scalar_one_or_none()
    if driver:
        cnt = driver.rating_count or 0
        avg = driver.rating if driver.rating is not None else 5.0
        driver.rating_count = cnt + 1
        driver.rating = round((avg * cnt + body.stars) / (cnt + 1), 2)
    await s.commit()
    await log_action("rating_submitted", actor_id=user.id, actor_role="passenger",
                     entity_type="booking", entity_id=booking_id, metadata={"stars": body.stars}, request=request)
    return serialize(doc, user)
