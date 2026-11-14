#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_masks.py
=================
Reproducible pipeline to generate 360-degree lunar horizon masks from a
global LOLA DEM GeoTIFF (MOON_PA, lat/lon).

Quick usage
-----------
  # Full batch (6 strategic sites)
  python generate_masks.py --dem LDEM64_PA_pixel_202405.tif

  # Custom site
  python generate_masks.py --dem LDEM64_PA_pixel_202405.tif \
      --id my_site --name "My Site" --lat -85.0 --lon 10.0

  # Custom parameters
  python generate_masks.py --dem LDEM64_PA_pixel_202405.tif \
      --max-radius 50000 --step 500 --observer-height 3.0

Output: horizon_masks/<site_id>.json  (one file per site)
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from pyproj import Geod
from rasterio.windows import Window

# ---------------------------------------------------------------------------
# Physical constants
# ---------------------------------------------------------------------------
MOON_RADIUS_M = 1_737_400.0
DEFAULT_OBSERVER_H_M = 2.0
DEFAULT_MIN_RADIUS_M = 500.0
DEFAULT_MAX_RADIUS_M = 80_000.0
DEFAULT_STEP_M = 250.0
DEFAULT_AZIMUTH_RES_DEG = 1.0

# ---------------------------------------------------------------------------
# Default strategic sites (6)
# ---------------------------------------------------------------------------
DEFAULT_SITES: list[dict[str, Any]] = [
    {"site_id": "shackleton_rim", "name": "Shackleton Crater Rim",
     "lat": -89.68, "lon": 129.20, "observer_height_m": 2.0},
    {"site_id": "malapert_massif", "name": "Malapert Massif",
     "lat": -86.00, "lon": 0.00, "observer_height_m": 2.0},
    {"site_id": "nobile_crater", "name": "Nobile Crater Rim",
     "lat": -85.20, "lon": 53.50, "observer_height_m": 2.0},
    {"site_id": "cabeus_crater", "name": "Cabeus Crater Floor",
     "lat": -84.90, "lon": -35.50, "observer_height_m": 2.0},
    {"site_id": "statio_shiv_shakti", "name": "Statio Shiv Shakti (Chandrayaan-3)",
     "lat": -69.373, "lon": 32.319, "observer_height_m": 2.0},
    {"site_id": "apollo_11", "name": "Apollo 11 (Mare Tranquillitatis)",
     "lat": 0.674, "lon": 23.473, "observer_height_m": 2.0},
]


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------
def _configure_stdout() -> None:
    for s in (sys.stdout, sys.stderr):
        if hasattr(s, "reconfigure"):
            try:
                s.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


def _rounded(v: float, ndigits: int) -> float:
    r = round(float(v), ndigits)
    return 0.0 if r == 0.0 else r


# ---------------------------------------------------------------------------
# Automatic elevation scale detection
# ---------------------------------------------------------------------------
def detect_elevation_scale(src: rasterio.DatasetReader) -> tuple[float, float]:
    """Return (unit_factor, radius_offset).

    unit_factor: 1.0 if values are already in meters, 1000.0 if in km.
    radius_offset: MOON_RADIUS_M if values are absolute planetary radius,
                   0.0 if relative elevation.
    """
    cx, cy = src.width // 2, src.height // 2
    win = Window(max(0, cx - 500), max(0, cy - 500), 1000, 1000)
    data = src.read(1, window=win).astype(np.float64)
    finite = data[np.isfinite(data)]
    if finite.size < 10:
        return 1.0, 0.0

    med = float(np.median(finite))

    # Detect unit: only if median is close to lunar radius (1737.4 km or 1737400 m)
    unit_factor = 1.0
    if abs(med - 1737.4) < 50.0:
        unit_factor = 1000.0  # km absolute radius
    elif abs(med - MOON_RADIUS_M) < 50_000.0:
        unit_factor = 1.0  # m absolute radius
    # Otherwise assume relative elevation in meters (no conversion)

    med_m = med * unit_factor

    # Absolute radius vs relative elevation
    radius_offset = 0.0
    if abs(med_m - MOON_RADIUS_M) < 50_000.0:
        radius_offset = MOON_RADIUS_M

    return unit_factor, radius_offset


# ---------------------------------------------------------------------------
# Raster sampling at (lon, lat) -> elevation in meters
# ---------------------------------------------------------------------------
def sample_raster(src: rasterio.DatasetReader, lon: np.ndarray, lat: np.ndarray,
                  unit_factor: float, radius_offset: float) -> np.ndarray:
    """Sample the GeoTIFF at geographic (lon, lat) coordinates.

    Returns elevation in meters (relative to lunar mean radius).
    """
    lon = np.asarray(lon, dtype=np.float64)
    lat = np.asarray(lat, dtype=np.float64)
    shape = lon.shape
    lon_f = lon.ravel()
    lat_f = lat.ravel()

    # Normalize lon to [0, 360) for 0..360 rasters
    lon_f = np.mod(lon_f, 360.0)

    transform = src.transform
    inv = ~transform
    cols = inv.a * lon_f + inv.b * lat_f + inv.c
    rows = inv.d * lon_f + inv.e * lat_f + inv.f
    cols_i = np.floor(cols).astype(np.int64)
    rows_i = np.floor(rows).astype(np.int64)

    h, w = src.height, src.width
    valid = (rows_i >= 0) & (rows_i < h) & (cols_i >= 0) & (cols_i < w)

    elev = np.full(lon_f.size, np.nan, dtype=np.float64)
    if np.any(valid):
        c0 = int(cols_i[valid].min())
        r0 = int(rows_i[valid].min())
        c1 = int(cols_i[valid].max()) + 1
        r1 = int(rows_i[valid].max()) + 1
        data = src.read(1, window=Window(c0, r0, c1 - c0, r1 - r0))
        for idx in np.where(valid)[0]:
            r = int(rows_i[idx]) - r0
            c = int(cols_i[idx]) - c0
            if 0 <= r < data.shape[0] and 0 <= c < data.shape[1]:
                v = float(data[r, c])
                if np.isfinite(v):
                    elev[idx] = v * unit_factor
        if radius_offset != 0.0:
            elev[valid] = elev[valid] - radius_offset

    return elev.reshape(shape)


# ---------------------------------------------------------------------------
# Horizon mask computation for a single site
# ---------------------------------------------------------------------------
def compute_horizon_mask(src: rasterio.DatasetReader, lat0: float, lon0: float,
                         unit_factor: float, radius_offset: float,
                         max_radius_m: float, step_m: float,
                         min_radius_m: float, observer_height_m: float,
                         azimuth_res_deg: float) -> tuple[list[float], float, dict]:
    """Return (mask_deg, surface_elevation_m, meta)."""
    geod = Geod(a=MOON_RADIUS_M, b=MOON_RADIUS_M)

    # Site elevation
    h0_arr = sample_raster(src, np.array([lon0]), np.array([lat0]),
                           unit_factor, radius_offset)
    h0 = float(h0_arr[0])
    if not math.isfinite(h0):
        raise ValueError(f"Site outside DEM coverage (lat={lat0}, lon={lon0})")

    azimuths = np.arange(0.0, 360.0, azimuth_res_deg, dtype=np.float64)
    distances = np.arange(min_radius_m, max_radius_m + step_m, step_m, dtype=np.float64)
    distances = distances[distances <= max_radius_m + 1e-9]
    if distances.size == 0:
        raise ValueError("Configuration produced zero samples per ray")

    n_az = azimuths.size
    n_dist = distances.size

    # Trace rays with Geod.fwd()
    az_bc = np.broadcast_to(azimuths[:, None], (n_az, n_dist)).ravel()
    dist_bc = np.broadcast_to(distances[None, :], (n_az, n_dist)).ravel()
    lon0_arr = np.full(az_bc.size, lon0, dtype=np.float64)
    lat0_arr = np.full(az_bc.size, lat0, dtype=np.float64)

    lon2, lat2, _ = geod.fwd(lon0_arr, lat0_arr, az_bc, dist_bc)
    xs = np.mod(np.asarray(lon2, dtype=np.float64).reshape(n_az, n_dist), 360.0)
    ys = np.asarray(lat2, dtype=np.float64).reshape(n_az, n_dist)

    # Sample elevations
    elevations = sample_raster(src, xs, ys, unit_factor, radius_offset)

    # Elevation angle with lunar curvature
    h_obs = h0 + observer_height_m
    drop = (distances[None, :] ** 2) / (2.0 * MOON_RADIUS_M)
    theta = np.degrees(np.arctan2(
        (elevations - h_obs) - drop,
        distances[None, :],
    ))
    theta = np.where(np.isfinite(elevations), theta, -np.inf)
    mask = np.max(theta, axis=1)
    valid_rays = np.isfinite(mask)
    mask = np.where(valid_rays, mask, 0.0)

    if not np.any(valid_rays):
        raise ValueError("No ray found valid data in the DEM")

    mask_rounded = [_rounded(float(v), 3) for v in mask]

    meta = {
        "rays": int(n_az),
        "samples_per_ray": int(n_dist),
        "valid_rays": int(np.count_nonzero(valid_rays)),
        "surface_elevation_m": h0,
    }
    return mask_rounded, h0, meta


# ---------------------------------------------------------------------------
# JSON generation for a single site
# ---------------------------------------------------------------------------
def generate_site_json(src: rasterio.DatasetReader, site: dict[str, Any],
                       unit_factor: float, radius_offset: float,
                       max_radius_m: float, step_m: float,
                       min_radius_m: float, observer_height_override: float | None,
                       output_dir: Path) -> dict[str, Any]:
    obs_h = observer_height_override if observer_height_override is not None else site.get("observer_height_m", DEFAULT_OBSERVER_H_M)

    mask, h0, meta = compute_horizon_mask(
        src, site["lat"], site["lon"], unit_factor, radius_offset,
        max_radius_m, step_m, min_radius_m, obs_h, DEFAULT_AZIMUTH_RES_DEG,
    )

    arr = np.array(mask, dtype=np.float64)
    result = {
        "site_id": site["site_id"],
        "name": site["name"],
        "coordinates": {
            "lat": _rounded(site["lat"], 6),
            "lon": _rounded(site["lon"], 6),
            "surface_elevation_m": _rounded(h0, 2),
            "observer_height_m": _rounded(obs_h, 2),
        },
        "metrics_summary": {
            "min_horizon_deg": _rounded(float(arr.min()), 3),
            "max_horizon_deg": _rounded(float(arr.max()), 3),
            "mean_horizon_deg": _rounded(float(arr.mean()), 3),
        },
        "horizon_mask_deg": mask,
    }

    out_path = output_dir / f"{site['site_id']}.json"
    out_path.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"  -> {out_path}  (min={arr.min():.3f} max={arr.max():.3f} mean={arr.mean():.3f})")
    return result


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate 360-degree lunar horizon masks from a global LOLA DEM GeoTIFF.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--dem", required=True, help="Path to the GeoTIFF (e.g. LDEM64_PA_pixel_202405.tif)")
    parser.add_argument("--output-dir", default="horizon_masks", help="Output directory for JSON files")
    parser.add_argument("--max-radius", type=float, default=DEFAULT_MAX_RADIUS_M, help="Maximum sampling radius (m)")
    parser.add_argument("--step", type=float, default=DEFAULT_STEP_M, help="Radial sampling step (m)")
    parser.add_argument("--min-radius", type=float, default=DEFAULT_MIN_RADIUS_M, help="Minimum sampling distance (m)")
    parser.add_argument("--observer-height", type=float, default=None, help="Observer height (m). Overrides per-site value.")
    # Single-site mode
    parser.add_argument("--id", dest="site_id", default=None, help="site_id for single-site mode")
    parser.add_argument("--name", dest="site_name", default=None, help="Site name for single-site mode")
    parser.add_argument("--lat", type=float, default=None, help="Site latitude for single-site mode")
    parser.add_argument("--lon", type=float, default=None, help="Site longitude for single-site mode")
    return parser.parse_args()


def main() -> int:
    _configure_stdout()
    args = parse_args()

    dem_path = Path(args.dem)
    if not dem_path.exists():
        print(f"ERROR: DEM not found: {dem_path}", file=sys.stderr)
        return 1

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Determine sites to process
    single_mode = args.site_id is not None or args.lat is not None or args.lon is not None
    if single_mode:
        if args.site_id is None or args.lat is None or args.lon is None:
            print("ERROR: Single-site mode requires --id, --lat, and --lon.", file=sys.stderr)
            return 1
        sites = [{
            "site_id": args.site_id,
            "name": args.site_name or args.site_id,
            "lat": args.lat,
            "lon": args.lon,
            "observer_height_m": args.observer_height or DEFAULT_OBSERVER_H_M,
        }]
    else:
        sites = DEFAULT_SITES

    with rasterio.open(dem_path) as src:
        unit_factor, radius_offset = detect_elevation_scale(src)
        print(f"DEM: {dem_path.name} | {src.width}x{src.height} px | "
              f"unit_factor={unit_factor} | radius_offset={radius_offset}")

        total = len(sites)
        for i, site in enumerate(sites, 1):
            print(f"\n[{i}/{total}] {site['site_id']} | lat={site['lat']} lon={site['lon']}")
            try:
                generate_site_json(src, site, unit_factor, radius_offset,
                                   args.max_radius, args.step, args.min_radius,
                                   args.observer_height, output_dir)
            except Exception as e:
                print(f"  ERROR: {e}", file=sys.stderr)

    print(f"\nDone. JSONs written to: {output_dir}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())