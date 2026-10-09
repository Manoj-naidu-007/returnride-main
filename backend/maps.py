"""Maps proxy: geocoding search, reverse geocoding, OSRM road routing.

Free-first providers: Nominatim (search/reverse) + OSRM (routing). No API key
required. Swappable via env MAPS_PROVIDER / GOOGLE_MAPS_API_KEY.
"""
import os
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth import get_current_user
from utils import haversine_km, valid_coord

router = APIRouter(prefix="/api/maps", tags=["maps"])

NOMINATIM = "https://nominatim.openstreetmap.org"
OSRM = "https://router.project-osrm.org"
UA = "ReturnRide/1.0 (rural-ride-matching; contact@returnride.app)"
PROVIDER = os.environ.get("MAPS_PROVIDER", "osm")

_cache: dict = {}
CACHE_TTL = 60 * 60  # 1h


def _cache_get(key):
    hit = _cache.get(key)
    if hit and (time.time() - hit[0]) < CACHE_TTL:
        return hit[1]
    return None


def _cache_set(key, val):
    _cache[key] = (time.time(), val)


@router.get("/search")
async def search(q: str = Query(min_length=2), _=Depends(get_current_user)):
    key = f"search:{q.lower().strip()}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    params = {"q": q, "format": "jsonv2", "addressdetails": 1, "limit": 8, "countrycodes": "in"}
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(f"{NOMINATIM}/search", params=params, headers={"User-Agent": UA})
            r.raise_for_status()
            data = r.json()
    except Exception:
        return {"results": []}
    results = [
        {
            "name": item.get("display_name", "").split(",")[0],
            "address": item.get("display_name", ""),
            "lat": float(item["lat"]),
            "lng": float(item["lon"]),
        }
        for item in data
    ]
    out = {"results": results}
    _cache_set(key, out)
    return out


@router.get("/reverse")
async def reverse(lat: float, lng: float, _=Depends(get_current_user)):
    if not valid_coord(lat, lng):
        raise HTTPException(400, "Invalid coordinates")
    key = f"rev:{round(lat, 5)},{round(lng, 5)}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    params = {"lat": lat, "lon": lng, "format": "jsonv2", "addressdetails": 1}
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(f"{NOMINATIM}/reverse", params=params, headers={"User-Agent": UA})
            r.raise_for_status()
            data = r.json()
        address = data.get("display_name", f"{lat:.4f}, {lng:.4f}")
    except Exception:
        address = f"{lat:.4f}, {lng:.4f}"
    out = {"address": address, "lat": lat, "lng": lng}
    _cache_set(key, out)
    return out


class RouteIn(BaseModel):
    origin_lat: float
    origin_lng: float
    dest_lat: float
    dest_lng: float


def _straight_line(o_lat, o_lng, d_lat, d_lng):
    dist = haversine_km(o_lat, o_lng, d_lat, d_lng)
    return {
        "geometry": [[o_lat, o_lng], [d_lat, d_lng]],
        "distance_km": round(dist, 2),
        "duration_min": round(dist / 40 * 60, 1),  # assume 40km/h
        "fallback": True,
    }


@router.post("/route")
async def route(body: RouteIn, _=Depends(get_current_user)):
    if not (valid_coord(body.origin_lat, body.origin_lng) and valid_coord(body.dest_lat, body.dest_lng)):
        raise HTTPException(400, "Invalid coordinates")
    key = f"route:{round(body.origin_lat,5)},{round(body.origin_lng,5)};{round(body.dest_lat,5)},{round(body.dest_lng,5)}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    coords = f"{body.origin_lng},{body.origin_lat};{body.dest_lng},{body.dest_lat}"
    url = f"{OSRM}/route/v1/driving/{coords}"
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(url, params={"overview": "full", "geometries": "geojson"},
                            headers={"User-Agent": UA})
            r.raise_for_status()
            data = r.json()
        rt = data["routes"][0]
        # geojson coords are [lng, lat] -> convert to [lat, lng]
        geometry = [[pt[1], pt[0]] for pt in rt["geometry"]["coordinates"]]
        out = {
            "geometry": geometry,
            "distance_km": round(rt["distance"] / 1000, 2),
            "duration_min": round(rt["duration"] / 60, 1),
            "fallback": False,
        }
    except Exception:
        out = _straight_line(body.origin_lat, body.origin_lng, body.dest_lat, body.dest_lng)
    _cache_set(key, out)
    return out
