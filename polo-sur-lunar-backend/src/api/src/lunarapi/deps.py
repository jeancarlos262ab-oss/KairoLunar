"""Shared FastAPI dependencies and serialization helpers."""

from __future__ import annotations

import math

import numpy as np
from fastapi import HTTPException, Request

from lunarapi import geometry as geo
from lunarapi.config import Settings
from lunarapi.store import DataStore, DatasetUnavailableError, Site


def get_store(request: Request) -> DataStore:
    return request.app.state.store


def get_settings(request: Request) -> Settings:
    return request.app.state.store.settings


def to_list(values: np.ndarray, decimals: int = 6) -> list[float]:
    """Round and convert to JSON-safe floats (NaN/Inf -> None is not expected here)."""
    return np.round(np.asarray(values, dtype=np.float64), decimals).tolist()


def finite_or_none(value: float) -> float | None:
    return value if math.isfinite(value) else None


def require_site(store: DataStore, site_id: str) -> Site:
    site = store.site(site_id)
    if site is None:
        raise HTTPException(status_code=404, detail=f"Site '{site_id}' not found.")
    return site


def terrain_pixel(store: DataStore, lat_deg: float, lon_deg: float) -> dict | None:
    """Continuous terrain.ldem pixel for a lat/lon, or ``None`` if terrain is unavailable."""
    try:
        terrain = store.terrain()
        heights = store.terrain_heights()
    except DatasetUnavailableError:
        return None
    x, y = geo.latlon_to_xy(lat_deg, lon_deg)
    row, col = geo.terrain_xy_to_rowcol(x, y, terrain.width, terrain.height, terrain.pixel_size_km)
    inside = 0.0 <= row <= terrain.height - 1 and 0.0 <= col <= terrain.width - 1
    elevation = float(geo.bilinear(heights, row, col)) if inside else None
    return {"row": row, "col": col, "inside": inside, "elevation_m": elevation}
