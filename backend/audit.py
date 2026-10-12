"""Append-only audit log helper (uses its own session so a failed request can't erase the log)."""
from fastapi import Request

from db import SessionLocal
from models import AuditLog
from utils import now_utc, parse_id


async def log_action(action, *, actor_id=None, actor_role=None, entity_type=None,
                     entity_id=None, level="info", metadata=None, request: Request | None = None):
    ip = None
    user_agent = None
    if request is not None:
        ip = request.client.host if request.client else None
        user_agent = (request.headers.get("user-agent") or "")[:512] or None
    try:
        async with SessionLocal() as s:
            s.add(AuditLog(
                created_at=now_utc(),
                actor_id=parse_id(actor_id),
                actor_role=actor_role,
                action=action,
                entity_type=entity_type,
                entity_id=str(entity_id) if entity_id is not None else None,
                ip=ip,
                user_agent=user_agent,
                meta=metadata or {},
                level=level,
            ))
            await s.commit()
    except Exception:
        # audit logging must never break the request
        pass
