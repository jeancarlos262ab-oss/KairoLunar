"""Downsampled terrain (terrain.ldem) metadata, height grids and point elevation queries."""

from __future__ import annotations

from typing import Literal

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query, Response

from lunarapi import geometry as geo
from lunarapi.deps import get_store, to_list
from lunarapi.schemas import ElevationResponse, TerrainHeightsJson, TerrainMetadata
from lunarapi.store import DataStore

router = APIRouter(prefix="/terrain", tags=["terrain"])


@router.get("", response_model=TerrainMetadata, summary="Terrain grid metadata")
def terrain_metadata(store: DataStore = Depends(get_store)) -> TerrainMetadata:
    t = store.terrain()
    half_w = (t.width / 2.0) * t.pixel_size_km * 1000.0
    half_h = (t.height / 2.0) * t.pixel_size_km * 1000.0
    return TerrainMetadata(
        width=t.width,
        height=t.height,
        pixel_size_km=t.pixel_size_km,
        resolution_m=t.pixel_size_km * 1000.0,
        extent_km={"x": t.width * t.pixel_size_km, "y": t.height * t.pixel_size_km},
        z_min_m=t.z_min_m,
        z_max_m=t.z_max_m,
        quantization_step_m=t.quantization_step_m,
        center={"lat_deg": -90.0, "lon_deg": 0.0, "row": t.height / 2.0, "col": t.width / 2.0},
        bounds_xy_m={"x_min": -half_w, "x_max": half_w, "y_min": -half_h, "y_max": half_h},
        orientation="row-major, row 0 = north (+y), columns increase east (+x); "
        "South Polar Stereographic centered on the pole (pixel centers)",
    )


@router.get(
    "/heights",
    summary="Terrain elevation grid",
    description=(
        "`encoding=json` returns a 2D array in meters. `float32` returns a raw little-endian "
        "Float32Array (meters, row-major) directly usable by `computeHorizonMask` of horizon-wasm. "
        "`uint16` returns the original quantized payload (see X-Z-Min / X-Z-Max headers). "
        "Binary responses expose `X-Width`, `X-Height`, `X-Pixel-Size-Km`, `X-Stride`."
    ),
    response_model=TerrainHeightsJson,
    responses={200: {"content": {"application/octet-stream": {}}}},
)
def terrain_heights(
    encoding: Literal["json", "float32", "uint16"] = "json",
    stride: int = Query(1, ge=1, le=64, description="Keep every N-th row/column."),
    store: DataStore = Depends(get_store),
):
    t = store.terrain()
    if encoding == "uint16":
        grid = t.raw[::stride, ::stride]
    else:
        grid = store.terrain_heights()[::stride, ::stride]
    h, w = grid.shape
    px_km = t.pixel_size_km * stride

    if encoding == "json":
        return TerrainHeightsJson(
            width=w,
            height=h,
            stride=stride,
            pixel_size_km=px_km,
            z_min_m=t.z_min_m,
            z_max_m=t.z_max_m,
            heights_m=[to_list(row, 2) for row in grid],
        )

    dtype = "<f4" if encoding == "float32" else "<u2"
    headers = {
        "X-Width": str(w),
        "X-Height": str(h),
        "X-Stride": str(stride),
        "X-Pixel-Size-Km": repr(px_km),
        "X-Z-Min": repr(t.z_min_m),
        "X-Z-Max": repr(t.z_max_m),
        "X-Encoding": encoding,
        "Access-Control-Expose-Headers": "X-Width, X-Height, X-Stride, X-Pixel-Size-Km, X-Z-Min, X-Z-Max, X-Encoding",
    }
    payload = np.ascontiguousarray(grid.astype(dtype)).tobytes()
    return Response(content=payload, media_type="application/octet-stream", headers=headers)


@router.get("/elevation", response_model=ElevationResponse, summary="Interpolated elevation at lat/lon")
def elevation(
    lat: float = Query(..., ge=-90, lt=90, description="Latitude (deg)."),
    lon: float = Query(..., ge=-360, le=360, description="Longitude (deg)."),
    store: DataStore = Depends(get_store),
) -> ElevationResponse:
    t = store.terrain()
    x, y = geo.latlon_to_xy(lat, lon)
    row, col = geo.terrain_xy_to_rowcol(x, y, t.width, t.height, t.pixel_size_km)
    if not (0.0 <= row <= t.height - 1 and 0.0 <= col <= t.width - 1):
        raise HTTPException(status_code=400, detail=f"Point ({lat}, {lon}) is outside the terrain grid.")
    z = float(geo.bilinear(store.terrain_heights(), row, col))
    return ElevationResponse(lat_deg=lat, lon_deg=lon, x_m=x, y_m=y, row=row, col=col, elevation_m=z)
