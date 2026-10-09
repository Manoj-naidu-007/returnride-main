"""Auth: registration, login (blocked check), JWT, role dependencies."""
import os
from datetime import timedelta
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from audit import log_action
from db import get_session
from models import User
from utils import normalize_phone, now_utc, parse_id

JWT_SECRET = os.environ.get("JWT_SECRET", "returnride-dev-secret-change-me")
JWT_ALG = "HS256"
JWT_DAYS = int(os.environ.get("JWT_EXPIRE_DAYS", "30"))

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
DUMMY_HASH = pwd.hash("returnride-dummy-never-used")
bearer = HTTPBearer(auto_error=False)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterIn(BaseModel):
    phone: str
    password: str = Field(min_length=4)
    name: str = Field(min_length=1)
    role: str = "passenger"  # passenger | driver
    gender: Optional[str] = None
    vehicle_model: Optional[str] = None
    vehicle_number: Optional[str] = None
    license_no: Optional[str] = None
    vehicle_rc_no: Optional[str] = None


class LoginIn(BaseModel):
    phone: str
    password: str


def make_token(user_id: str, role: str) -> str:
    claims = {
        "sub": user_id,
        "role": role,
        "iat": now_utc(),
        "exp": now_utc() + timedelta(days=JWT_DAYS),
    }
    return jwt.encode(claims, JWT_SECRET, algorithm=JWT_ALG)


def public_user(user: User) -> dict:
    return user.to_dict()  # to_dict() already strips password_hash / otp fields


@router.post("/register")
async def register(body: RegisterIn, request: Request, s: AsyncSession = Depends(get_session)):
    phone = normalize_phone(body.phone)
    if not phone:
        raise HTTPException(400, "Phone must be 7-15 digits")
    if body.role not in ("passenger", "driver"):
        raise HTTPException(400, "Invalid role")
    if (await s.execute(select(User.id).where(User.phone == phone))).first():
        raise HTTPException(409, "Phone already registered")
    user = User(
        phone=phone,
        password_hash=pwd.hash(body.password),
        name=body.name.strip(),
        role=body.role,
        gender=body.gender,
        status="active",
        rating=5.0,
        rating_count=0,
        vehicle_model=body.vehicle_model,
        vehicle_number=body.vehicle_number,
        license_no=body.license_no,
        vehicle_rc_no=body.vehicle_rc_no,
        verified=False,
        wallet_balance=500.0,
        last_login_at=now_utc(),
        created_at=now_utc(),
    )
    s.add(user)
    try:
        await s.commit()
    except IntegrityError:  # two simultaneous registrations with the same phone
        await s.rollback()
        raise HTTPException(409, "Phone already registered")
    await log_action("register", actor_id=user.id, actor_role=body.role,
                     entity_type="user", entity_id=user.id, request=request)
    token = make_token(str(user.id), body.role)
    return {"access_token": token, "token_type": "bearer", "user": public_user(user)}


@router.post("/login")
async def login(body: LoginIn, request: Request, s: AsyncSession = Depends(get_session)):
    phone = normalize_phone(body.phone)
    if not phone:
        raise HTTPException(400, "Phone must be 7-15 digits")
    user = (await s.execute(select(User).where(User.phone == phone, User.deleted_at.is_(None)))).scalar_one_or_none()
    password_hash = user.password_hash if user else DUMMY_HASH
    ok = pwd.verify(body.password, password_hash)
    if not user or not ok:
        await log_action("login_failure", actor_role="unknown", level="warn",
                         metadata={"phone": phone}, request=request)
        raise HTTPException(401, "Incorrect phone or password")
    if user.status == "blocked":
        await log_action("blocked_login_attempt", actor_id=user.id, actor_role=user.role,
                         level="warn", entity_type="user", entity_id=user.id, request=request)
        raise HTTPException(403, user.blocked_reason or "Your account has been blocked. Contact support.")
    if user.status == "suspended":
        raise HTTPException(403, "Your account is suspended.")
    await s.execute(update(User).where(User.id == user.id).values(last_login_at=now_utc()))
    await s.commit()
    await log_action("login_success", actor_id=user.id, actor_role=user.role,
                     entity_type="user", entity_id=user.id, request=request)
    token = make_token(str(user.id), user.role)
    return {"access_token": token, "token_type": "bearer", "user": public_user(user)}


async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(bearer),
                           s: AsyncSession = Depends(get_session)) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    user_id = parse_id(payload.get("sub"))
    if user_id is None:
        raise HTTPException(401, "Invalid token")
    user = (await s.execute(select(User).where(User.id == user_id, User.deleted_at.is_(None)))).scalar_one_or_none()
    if not user or user.status == "blocked":
        raise HTTPException(401, "Account unavailable")
    return user


def require_role(*allowed):
    async def dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(403, "Insufficient permissions")
        return user
    return dep


@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return public_user(user)
