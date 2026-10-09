"""MySQL connection (SQLAlchemy 2.0 async + aiomysql), session helpers and settings cache."""
import os
from pathlib import Path
from typing import AsyncIterator

from dotenv import load_dotenv
from sqlalchemy import select
from sqlalchemy.engine import URL
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")


def build_database_url():
    """DATABASE_URL wins if set; otherwise build it from the MYSQL_* variables."""
    explicit = os.environ.get("DATABASE_URL")
    if explicit:
        return explicit
    return URL.create(
        "mysql+aiomysql",
        username=os.environ.get("MYSQL_USER", "returnride"),
        password=os.environ.get("MYSQL_PASSWORD", ""),
        host=os.environ.get("MYSQL_HOST", "127.0.0.1"),
        port=int(os.environ.get("MYSQL_PORT", "3306")),
        database=os.environ.get("MYSQL_DATABASE", "returnride"),
        query={"charset": "utf8mb4"},
    )


engine = create_async_engine(
    build_database_url(),
    pool_pre_ping=True,      # transparently drop dead connections
    pool_recycle=1800,       # recycle before MySQL's wait_timeout kills them
    pool_size=10,
    max_overflow=20,
    echo=os.environ.get("SQL_ECHO", "false").lower() == "true",
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: one session per request (shared by all dependencies)."""
    async with SessionLocal() as session:
        yield session


DEFAULT_SETTINGS = {
    "base_fare": 20.0,
    "rate_per_km": 8.0,
    "return_discount": 0.25,
    "pool_discount": 0.12,
    "corridor_km": 1.5,
    "co2_per_km": 0.12,  # kg CO2 saved per shared km
}

_settings_cache: dict | None = None


async def get_settings() -> dict:
    """Fare/matching settings (single row, id='fare'), cached in-process."""
    global _settings_cache
    if _settings_cache is None:
        from models import AppSettings  # local import avoids a circular import
        async with SessionLocal() as s:
            row = (await s.execute(select(AppSettings).where(AppSettings.id == "fare"))).scalar_one_or_none()
            if row is None:
                row = AppSettings(id="fare", **DEFAULT_SETTINGS)
                s.add(row)
                await s.commit()
            _settings_cache = {k: float(getattr(row, k)) for k in DEFAULT_SETTINGS}
    return _settings_cache


def clear_settings_cache():
    global _settings_cache
    _settings_cache = None
