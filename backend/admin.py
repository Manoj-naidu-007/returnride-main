"""Admin: stats, user/driver management, bookings, live map, audit logs, settings."""
import csv
import io
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import and_, case, distinct, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from audit import log_action
from auth import require_role
from db import clear_settings_cache, get_session, get_settings
from models import AppSettings, AuditLog, Booking, BookingEvent, Ride, User
from utils import like_escape, now_utc, parse_id

router = APIRouter(prefix="/api/admin", tags=["admin"])

ALL_STATUSES = ["requested", "accepted", "en_route", "arrived", "in_progress", "completed", "cancelled", "rejected"]
USER_STATUSES = {"active", "blocked", "suspended"}
USER_ROLES = {"passenger", "driver", "admin"}


def _day(v) -> str:
    return v.isoformat() if hasattr(v, "isoformat") else str(v)[:10]


@router.get("/stats")
async def stats(_: User = Depends(require_role("admin")), s: AsyncSession = Depends(get_session)):
    status_split = {k: 0 for k in ALL_STATUSES}
    for st, n in (await s.execute(select(Booking.status, func.count(Booking.id)).group_by(Booking.status))).all():
        status_split[st] = n
    total = sum(status_split.values())
    completed = status_split["completed"]
    cancelled = status_split["cancelled"] + status_split["rejected"]
    ongoing = status_split["in_progress"]
    pending = sum(status_split[k] for k in ("requested", "accepted", "en_route", "arrived"))

    total_users = (await s.execute(select(func.count(User.id)).where(User.deleted_at.is_(None)))).scalar_one()
    total_drivers = (await s.execute(select(func.count(User.id)).where(
        User.role == "driver", User.deleted_at.is_(None)))).scalar_one()
    active_drivers = (await s.execute(select(func.count(distinct(Booking.driver_id))).where(
        Booking.status == "in_progress"))).scalar_one()

    revenue = (await s.execute(select(func.coalesce(func.sum(Booking.final_fare), 0)).where(
        Booking.payment_status == "paid"))).scalar_one()
    revenue = round(float(revenue), 2)

    # bookings per day (14 days) + revenue per day
    since = now_utc() - timedelta(days=14)
    day = func.date(Booking.created_at)
    rows = await s.execute(
        select(day, func.count(Booking.id),
               func.coalesce(func.sum(case((Booking.payment_status == "paid", Booking.final_fare), else_=0)), 0),
               func.sum(case((Booking.payment_status == "paid", 1), else_=0)))
        .where(Booking.created_at >= since).group_by(day).order_by(day))
    per_day, rev_day = [], []
    for d, cnt, amount, paid_cnt in rows.all():
        per_day.append({"date": _day(d), "count": cnt})
        if paid_cnt:
            rev_day.append({"date": _day(d), "amount": round(float(amount), 2)})

    return {
        "kpis": {
            "total": total, "completed": completed, "cancelled": cancelled,
            "ongoing": ongoing, "pending": pending, "revenue": revenue,
            "total_users": total_users, "total_drivers": total_drivers,
            "active_drivers": active_drivers,
        },
        "bookings_per_day": per_day,
        "revenue_per_day": rev_day,
        "status_split": status_split,
    }


@router.get("/users")
async def list_users(role: str | None = None, status: str | None = None,
                     q: str | None = None, skip: int = 0, limit: int = 50,
                     _: User = Depends(require_role("admin")), s: AsyncSession = Depends(get_session)):
    limit = max(1, min(limit, 200))
    conds = [User.deleted_at.is_(None)]
    if role:
        conds.append(User.role == role)
    if status:
        conds.append(User.status == status)
    if q:
        term = f"%{like_escape(q.strip().lower())}%"
        conds.append(or_(func.lower(User.name).like(term, escape="\\"), User.phone.like(term, escape="\\")))
    total = (await s.execute(select(func.count(User.id)).where(*conds))).scalar_one()
    docs = (await s.execute(select(User).where(*conds).order_by(User.created_at.desc())
                            .offset(max(skip, 0)).limit(limit))).scalars().all()

    stats_by_driver: dict = {}
    if docs:
        rows = await s.execute(
            select(Booking.driver_id, Booking.status, func.count(Booking.id))
            .where(Booking.driver_id.in_([d.id for d in docs]),
                   Booking.status.in_(["completed", "cancelled", "rejected"]))
            .group_by(Booking.driver_id, Booking.status))
        for did, st, n in rows.all():
            c = stats_by_driver.setdefault(did, {"completed": 0, "cancelled": 0})
            c["completed" if st == "completed" else "cancelled"] += n

    out = []
    for d in docs:
        item = d.to_dict()
        c = stats_by_driver.get(d.id, {})
        item["completed_rides"] = c.get("completed", 0)
        item["cancelled_rides"] = c.get("cancelled", 0)
        out.append(item)
    return {"users": out, "total": total}


class UserPatch(BaseModel):
    status: str | None = None
    blocked_reason: str | None = None
    role: str | None = None
    verified: bool | None = None
    reset_password: str | None = None


@router.patch("/users/{user_id}")
async def patch_user(user_id: str, body: UserPatch, request: Request,
                     admin: User = Depends(require_role("admin")), s: AsyncSession = Depends(get_session)):
    uid = parse_id(user_id)
    if uid is None:
        raise HTTPException(404, "Not found")
    user = (await s.execute(select(User).where(User.id == uid))).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "Not found")
    updates = {}
    action = "admin_update_user"
    if body.status is not None:
        if body.status not in USER_STATUSES:
            raise HTTPException(400, "Invalid status")
        updates["status"] = body.status
        updates["blocked_reason"] = body.blocked_reason
        action = "admin_block" if body.status == "blocked" else ("admin_unblock" if body.status == "active" else "admin_suspend")
    if body.role is not None:
        if body.role not in USER_ROLES:
            raise HTTPException(400, "Invalid role")
        updates["role"] = body.role
        action = "admin_role_change"
    if body.verified is not None:
        updates["verified"] = body.verified
        action = "admin_verify" if body.verified else "admin_unverify"
    if body.reset_password:
        updates["password_hash"] = CryptContext(schemes=["bcrypt"], deprecated="auto").hash(body.reset_password)
        action = "admin_reset_password"
    if not updates:
        raise HTTPException(400, "Nothing to update")
    for k, v in updates.items():
        setattr(user, k, v)
    await s.commit()
    await log_action(action, actor_id=admin.id, actor_role="admin",
                     entity_type="user", entity_id=uid,
                     metadata={k: v for k, v in updates.items() if k != "password_hash"}, request=request)
    return user.to_dict()


@router.delete("/users/{user_id}")
async def soft_delete_user(user_id: str, request: Request,
                           admin: User = Depends(require_role("admin")), s: AsyncSession = Depends(get_session)):
    uid = parse_id(user_id)
    if uid is None:
        raise HTTPException(404, "Not found")
    await s.execute(update(User).where(User.id == uid).values(deleted_at=now_utc(), status="suspended"))
    await s.commit()
    await log_action("admin_delete_user", actor_id=admin.id, actor_role="admin",
                     entity_type="user", entity_id=uid, request=request)
    return {"ok": True}


@router.get("/bookings")
async def admin_bookings(status: str | None = None, driver_id: str | None = None,
                         passenger_id: str | None = None, skip: int = 0, limit: int = 50,
                         _: User = Depends(require_role("admin")), s: AsyncSession = Depends(get_session)):
    limit = max(1, min(limit, 200))
    conds = []
    if status:
        conds.append(Booking.status == status)
    if driver_id:
        conds.append(Booking.driver_id == (parse_id(driver_id) or -1))
    if passenger_id:
        conds.append(Booking.passenger_id == (parse_id(passenger_id) or -1))
    total = (await s.execute(select(func.count(Booking.id)).where(*conds))).scalar_one()
    docs = (await s.execute(select(Booking).where(*conds).order_by(Booking.created_at.desc())
                            .offset(max(skip, 0)).limit(limit))).scalars().all()
    return {"bookings": [d.to_dict() for d in docs], "total": total}


@router.get("/bookings/{booking_id}")
async def admin_booking_detail(booking_id: str, _: User = Depends(require_role("admin")),
                               s: AsyncSession = Depends(get_session)):
    bid = parse_id(booking_id)
    if bid is None:
        raise HTTPException(404, "Not found")
    doc = (await s.execute(select(Booking).where(Booking.id == bid))).scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Not found")
    events = (await s.execute(select(BookingEvent).where(BookingEvent.booking_id == bid)
                              .order_by(BookingEvent.created_at, BookingEvent.id).limit(100))).scalars().all()
    out = doc.to_dict()
    out["otp_result"] = "verified" if doc.otp_verified_at else ("failed" if doc.otp_attempts else "pending")
    return {"booking": out, "timeline": [e.to_dict() for e in events]}


class CancelIn(BaseModel):
    reason: str


@router.post("/bookings/{booking_id}/cancel")
async def force_cancel(booking_id: str, body: CancelIn, request: Request,
                       admin: User = Depends(require_role("admin")), s: AsyncSession = Depends(get_session)):
    bid = parse_id(booking_id)
    if bid is None:
        raise HTTPException(404, "Not found")
    doc = (await s.execute(select(Booking).where(Booking.id == bid))).scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Not found")
    if doc.status in ("completed", "cancelled", "rejected"):
        raise HTTPException(400, "Booking already closed")
    if doc.status in ("accepted", "en_route", "arrived"):  # give the reserved seat back
        await s.execute(update(Ride).where(Ride.id == doc.ride_id)
                        .values(seats_available=func.least(Ride.seats_available + 1, Ride.seats_total)))
    doc.status = "cancelled"
    doc.cancelled_at = now_utc()
    doc.cancelled_by = "admin"
    doc.cancel_reason = body.reason
    s.add(BookingEvent(booking_id=doc.id, status="cancelled", actor_id=admin.id, created_at=now_utc()))
    await s.commit()
    await log_action("admin_force_cancel", actor_id=admin.id, actor_role="admin", level="warn",
                     entity_type="booking", entity_id=bid, metadata={"reason": body.reason}, request=request)
    return {"ok": True}


@router.get("/live")
async def live(_: User = Depends(require_role("admin")), s: AsyncSession = Depends(get_session)):
    docs = (await s.execute(select(Booking).where(
        Booking.status.in_(["accepted", "en_route", "arrived", "in_progress"])).limit(200))).scalars().all()
    return {"rides": [d.to_dict() for d in docs]}


def _log_filters(level, action, actor, q):
    conds = []
    if level:
        conds.append(AuditLog.level == level)
    if action:
        conds.append(func.lower(AuditLog.action).like(f"%{like_escape(action.lower())}%", escape="\\"))
    if actor:
        conds.append(AuditLog.actor_id == (parse_id(actor) or -1))
    if q:
        term = f"%{like_escape(q.lower())}%"
        conds.append(or_(func.lower(AuditLog.action).like(term, escape="\\"),
                         func.lower(AuditLog.entity_type).like(term, escape="\\")))
    return conds


@router.get("/logs")
async def logs(level: str | None = None, action: str | None = None, actor: str | None = None,
               q: str | None = None, skip: int = 0, limit: int = 100,
               _: User = Depends(require_role("admin")), s: AsyncSession = Depends(get_session)):
    limit = max(1, min(limit, 500))
    conds = _log_filters(level, action, actor, q)
    total = (await s.execute(select(func.count(AuditLog.id)).where(*conds))).scalar_one()
    docs = (await s.execute(select(AuditLog).where(*conds).order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
                            .offset(max(skip, 0)).limit(limit))).scalars().all()
    return {"logs": [d.to_dict() for d in docs], "total": total}


@router.get("/logs/export")
async def export_logs(_: User = Depends(require_role("admin")), s: AsyncSession = Depends(get_session)):
    docs = (await s.execute(select(AuditLog).order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
                            .limit(10000))).scalars().all()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["created_at", "level", "action", "actor_id", "actor_role", "entity_type", "entity_id", "ip"])
    for d in docs:
        writer.writerow([str(d.created_at), d.level, d.action, d.actor_id,
                         d.actor_role, d.entity_type, d.entity_id, d.ip])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=audit_logs.csv"})


class SettingsIn(BaseModel):
    base_fare: float | None = None
    rate_per_km: float | None = None
    return_discount: float | None = None
    pool_discount: float | None = None
    corridor_km: float | None = None
    co2_per_km: float | None = None


@router.get("/settings")
async def get_admin_settings(_: User = Depends(require_role("admin"))):
    return await get_settings()


@router.put("/settings")
async def put_settings(body: SettingsIn, request: Request, admin: User = Depends(require_role("admin")),
                       s: AsyncSession = Depends(get_session)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nothing to update")
    await get_settings()  # makes sure the 'fare' row exists
    await s.execute(update(AppSettings).where(AppSettings.id == "fare").values(**updates))
    await s.commit()
    clear_settings_cache()
    await log_action("admin_settings_change", actor_id=admin.id, actor_role="admin",
                     entity_type="settings", metadata=updates, request=request)
    return await get_settings()
