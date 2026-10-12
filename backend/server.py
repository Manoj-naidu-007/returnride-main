import asyncio
import logging
import os

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware

import admin as admin_module
import auth as auth_module
import bookings as bookings_module
import maps as maps_module
import rides as rides_module
from audit import log_action
from auth import get_current_user
from db import engine, get_session, get_settings
from models import Base, Village
from seed import run_seed
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from utils import compute_fare

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("returnride")

app = FastAPI(title="ReturnRide API")

misc = APIRouter(prefix="/api", tags=["misc"])


@misc.get("/")
async def root():
    return {"message": "ReturnRide API", "status": "ok"}


@misc.get("/villages")
async def list_villages(_=Depends(get_current_user), s: AsyncSession = Depends(get_session)):
    docs = (await s.execute(select(Village).limit(50))).scalars().all()
    return {"villages": [d.to_dict() for d in docs]}


@misc.get("/fare/quote")
async def fare_quote(distance_km: float, is_return: bool = True, pooled: bool = False,
                     _=Depends(get_current_user)):
    settings = await get_settings()
    total, breakdown = compute_fare(distance_km, settings, is_return=is_return, pooled=pooled)
    return {"total": total, "breakdown": breakdown}


app.include_router(auth_module.router)
app.include_router(maps_module.router)
app.include_router(rides_module.router)
app.include_router(bookings_module.router)
app.include_router(admin_module.router)
app.include_router(misc)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s", request.url.path)
    try:
        await log_action("server_error", level="error", metadata={"path": str(request.url.path), "error": str(exc)}, request=request)
    except Exception:
        pass
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


async def _wait_for_db(retries: int = 30, delay: float = 2.0):
    """MySQL in Docker can take a while to accept connections — retry instead of crashing."""
    for attempt in range(1, retries + 1):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)  # creates missing tables only
            return
        except Exception as exc:
            logger.warning("MySQL not ready (%s/%s): %s", attempt, retries, exc)
            if attempt == retries:
                raise
            await asyncio.sleep(delay)


@app.on_event("startup")
async def startup():
    await _wait_for_db()
    await run_seed()
    logger.info("ReturnRide startup complete")


@app.on_event("shutdown")
async def shutdown():
    await engine.dispose()
