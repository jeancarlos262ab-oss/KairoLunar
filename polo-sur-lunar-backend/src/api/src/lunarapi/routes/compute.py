"""On-demand computations (same algorithms as lunarpipe / horizon-wasm)."""

from __future__ import annotations

import numpy as np
from fastapi import APIRouter, Depends, HTTPException

from lunarapi import geometry as geo
from lunarapi.analysis import evaluate_sky_position, to_unix
from lunarapi.deps import get_store, require_site, to_list
from lunarapi.schemas import (
    HorizonComputeRequest,
    HorizonComputeResponse,
    SkyPositionRequest,
    SkyPositionResponse,
    SolarDiskRequest,
    SolarDiskResponse,
)
from lunarapi.store import DataStore

router = APIRouter(prefix="/compute", tags=["compute"])


@router.post(
    "/solar-disk-fraction",
    response_model=SolarDiskResponse,
    summary="Visible solar disk fraction (circular-segment model)",
)
def solar_disk_fraction(body: SolarDiskRequest) -> SolarDiskResponse:
    frac = geo.solar_disk_fraction(
        body.sun_elevation_deg, body.horizon_elevation_deg, body.solar_angular_radius_deg
    )
    return SolarDiskResponse(visible_fraction=float(frac))


@router.post(
    "/horizon-mask",
    response_model=HorizonComputeResponse,
    summary="Horizon mask for an arbitrary point on the downsampled terrain",
    description=(
        "Ray-marches over terrain.ldem (low resolution, quantized). Useful for exploring "
        "points not present in horizons.lhor; precise masks come from the full-resolution pipeline."
    ),
)
def horizon_mask(body: HorizonComputeRequest, store: DataStore = Depends(get_store)) -> HorizonComputeResponse:
    t = store.terrain()
    x, y = geo.latlon_to_xy(body.lat_deg, body.lon_deg)
    row, col = geo.terrain_xy_to_rowcol(x, y, t.width, t.height, t.pixel_size_km)
    if not (0.0 <= row <= t.height - 1 and 0.0 <= col <= t.width - 1):
        raise HTTPException(status_code=400, detail="Point is outside the terrain grid.")
    resolution_m = t.pixel_size_km * 1000.0
    mask = geo.compute_horizon_mask(
        store.terrain_heights(),
        row,
        col,
        resolution_m,
        n_azimuths=body.n_azimuths,
        max_distance_m=body.max_distance_m,
        observer_height_m=body.observer_height_m,
    )
    if body.frame == "true":
        mask = geo.horizon_in_true_frame(mask, body.lon_deg)
    return HorizonComputeResponse(
        source="terrain.ldem",
        lat_deg=body.lat_deg,
        lon_deg=body.lon_deg,
        row=row,
        col=col,
        resolution_m=resolution_m,
        frame=body.frame,
        grid_to_true_offset_deg=body.lon_deg % 360.0,
        azimuths_deg=to_list(np.arange(body.n_azimuths) * (360.0 / body.n_azimuths), 4),
        elevations_deg=to_list(mask, 3),
    )


@router.post(
    "/sky-position",
    response_model=SkyPositionResponse,
    summary="Sun/Earth azimuth & elevation from a surface point at a given time",
)
def sky_position(body: SkyPositionRequest, store: DataStore = Depends(get_store)) -> SkyPositionResponse:
    eph = store.ephemeris()
    unix = to_unix(body.time)
    assert unix is not None
    site = require_site(store, body.site_id) if body.site_id is not None else None
    result = evaluate_sky_position(
        eph=eph,
        at_unix=unix,
        lat_deg=body.lat_deg,
        lon_deg=body.lon_deg,
        solar_radius_deg=store.settings.solar_angular_radius_deg,
        site=site,
    )
    return SkyPositionResponse(**result)
