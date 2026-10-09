"""SQLAlchemy ORM models (MySQL 8 / MariaDB 10.5+).

IDs are auto-increment integers in the database but are always sent to API clients as
strings, so the API contract is identical to the previous MongoDB version.
"""
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (JSON, BigInteger, Boolean, Float, ForeignKey, Index, Integer,
                        Numeric, String, Text, inspect)
from sqlalchemy.dialects.mysql import DATETIME
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import TypeDecorator

SECRET_FIELDS = {"password_hash", "otp_hash", "otp"}


class UTCDateTime(TypeDecorator):
    """Stores UTC in a DATETIME(6) column, always returns timezone-aware UTC datetimes."""
    impl = DATETIME(fsp=6)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is not None:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc)


def _now() -> datetime:
    return datetime.now(timezone.utc)


# column-attribute name -> key used in API responses
_API_RENAMES = {"pickup_point": "pickup", "drop_point": "drop", "meta": "metadata"}


class Base(DeclarativeBase):
    def to_dict(self, include_secrets: bool = False) -> dict:
        out = {}
        for attr in inspect(self).mapper.column_attrs:
            key, val = attr.key, getattr(self, attr.key)
            if not include_secrets and key in SECRET_FIELDS:
                continue
            if key == "id" or key.endswith("_id"):
                val = str(val) if val is not None else None
            elif isinstance(val, datetime):
                val = val.isoformat()
            elif isinstance(val, Decimal):
                val = float(val)
            out[_API_RENAMES.get(key, key)] = val
        return out


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    phone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="passenger", index=True)  # passenger|driver|admin
    gender: Mapped[str | None] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)  # active|blocked|suspended
    blocked_reason: Mapped[str | None] = mapped_column(String(255))
    rating: Mapped[float] = mapped_column(Float, nullable=False, default=5.0)
    rating_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    vehicle_model: Mapped[str | None] = mapped_column(String(100))
    vehicle_number: Mapped[str | None] = mapped_column(String(30))
    license_no: Mapped[str | None] = mapped_column(String(50))
    vehicle_rc_no: Mapped[str | None] = mapped_column(String(50))
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    wallet_balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=_now, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class Ride(Base):
    __tablename__ = "rides"
    __table_args__ = (Index("ix_rides_status_seats", "status", "seats_available"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    driver_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False, index=True)
    driver_name: Mapped[str | None] = mapped_column(String(120))
    vehicle_model: Mapped[str | None] = mapped_column(String(100))
    vehicle_number: Mapped[str | None] = mapped_column(String(30))
    driver_rating: Mapped[float] = mapped_column(Float, nullable=False, default=5.0)
    origin: Mapped[dict] = mapped_column(JSON, nullable=False)   # {lat, lng, address}
    dest: Mapped[dict] = mapped_column(JSON, nullable=False)     # {lat, lng, address}
    distance_km: Mapped[float] = mapped_column(Float, nullable=False)
    duration_min: Mapped[float] = mapped_column(Float, nullable=False)
    route_geometry: Mapped[list] = mapped_column(JSON, nullable=False)  # [[lat, lng], ...]
    depart_start: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    depart_end: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    seats_total: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    seats_available: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    fare_rate: Mapped[float | None] = mapped_column(Float)
    women_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    recurring: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_return: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=_now)


class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = (
        Index("ix_bookings_passenger_status", "passenger_id", "status"),
        Index("ix_bookings_driver_status", "driver_id", "status"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ride_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("rides.id"), nullable=False, index=True)
    driver_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    passenger_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    driver_name: Mapped[str | None] = mapped_column(String(120))
    vehicle_model: Mapped[str | None] = mapped_column(String(100))
    vehicle_number: Mapped[str | None] = mapped_column(String(30))
    passenger_name: Mapped[str | None] = mapped_column(String(120))
    passenger_phone: Mapped[str | None] = mapped_column(String(20))

    # "pickup" / "drop" in the API; "drop" is a reserved SQL word so the column is drop_point
    pickup_point: Mapped[dict] = mapped_column(JSON, nullable=False)
    drop_point: Mapped[dict] = mapped_column(JSON, nullable=False)
    distance_km: Mapped[float] = mapped_column(Float, nullable=False)
    duration_min: Mapped[float] = mapped_column(Float, nullable=False)
    route_geometry: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    pooled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_return: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    estimated_fare: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    fare_breakdown: Mapped[dict | None] = mapped_column(JSON)
    final_fare: Mapped[float | None] = mapped_column(Numeric(10, 2))
    actual_distance_km: Mapped[float | None] = mapped_column(Float)
    complete_override_reason: Mapped[str | None] = mapped_column(String(255))

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="requested", index=True)

    # start-ride OTP
    otp: Mapped[str | None] = mapped_column(String(8))
    otp_hash: Mapped[str | None] = mapped_column(String(64))
    otp_expires_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    otp_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    otp_locked_until: Mapped[datetime | None] = mapped_column(UTCDateTime)
    otp_verified_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    driver_location: Mapped[dict | None] = mapped_column(JSON)  # {lat, lng, heading, updated_at}
    arrived_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    cancelled_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    cancelled_by: Mapped[str | None] = mapped_column(String(20))
    cancel_reason: Mapped[str | None] = mapped_column(String(255))

    payment_mode: Mapped[str | None] = mapped_column(String(20))
    payment_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    paid_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    rating: Mapped[int | None] = mapped_column(Integer)
    rating_comment: Mapped[str | None] = mapped_column(Text)
    co2_saved: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=_now, index=True)


class BookingEvent(Base):
    __tablename__ = "booking_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    booking_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("bookings.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    actor_id: Mapped[int | None] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=_now)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=_now, index=True)
    actor_id: Mapped[int | None] = mapped_column(BigInteger, index=True)
    actor_role: Mapped[str | None] = mapped_column(String(20))
    action: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    entity_type: Mapped[str | None] = mapped_column(String(40))
    entity_id: Mapped[str | None] = mapped_column(String(64))
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(512))
    meta: Mapped[dict | None] = mapped_column("metadata", JSON)   # exposed as "metadata" in the API
    level: Mapped[str] = mapped_column(String(10), nullable=False, default="info", index=True)


class AppSettings(Base):
    __tablename__ = "app_settings"

    id: Mapped[str] = mapped_column(String(20), primary_key=True)  # always "fare"
    base_fare: Mapped[float] = mapped_column(Float, nullable=False, default=20.0)
    rate_per_km: Mapped[float] = mapped_column(Float, nullable=False, default=8.0)
    return_discount: Mapped[float] = mapped_column(Float, nullable=False, default=0.25)
    pool_discount: Mapped[float] = mapped_column(Float, nullable=False, default=0.12)
    corridor_km: Mapped[float] = mapped_column(Float, nullable=False, default=1.5)
    co2_per_km: Mapped[float] = mapped_column(Float, nullable=False, default=0.12)


class Village(Base):
    __tablename__ = "villages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    type: Mapped[str | None] = mapped_column(String(40))
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    address: Mapped[str | None] = mapped_column(String(255))
