"""Geometric computations shared by the API endpoints.

All algorithms mirror the conventions of ``lunarpipe`` (Python) and ``@polo-sur-lunar/horizon``
(TypeScript):

* South Polar Stereographic projection with a spherical lunar radius of ``1_737_400 m``.
* Horizon masks are indexed by *grid* azimuth: ``0 deg`` = grid north (decreasing row, ``+y``),
  increasing clockwise (``90 deg`` = grid east, ``+x``).
* For a site at longitude ``lon``, local *true* north points away from the pole, which in the
  polar stereographic grid has grid azimuth ``lon``. Therefore
  ``grid_azimuth = (true_azimuth + lon) mod 360``.
* Solar disk visibility uses the circular-segment model (``solarDiskFraction``).
"""

from __future__ import annotations

import math

import numpy as np

LUNAR_RADIUS_M = 1_737_400.0
LUNAR_RADIUS_KM = LUNAR_RADIUS_M / 1000.0
DEFAULT_SOLAR_ANGULAR_RADIUS_DEG = 0.2666


# --------------------------------------------------------------------------- projection
def latlon_to_xy(lat_deg: float, lon_deg: float, radius_m: float = LUNAR_RADIUS_M) -> tuple[float, float]:
    """Selenographic lat/lon (deg) -> South Polar Stereographic ``(x, y)`` meters."""
    colat = math.radians(90.0 + lat_deg)
    rho = 2.0 * radius_m * math.tan(colat / 2.0)
    lon = math.radians(lon_deg)
    return rho * math.sin(lon), rho * math.cos(lon)


def xy_to_latlon(x_m: float, y_m: float, radius_m: float = LUNAR_RADIUS_M) -> tuple[float, float]:
    """Inverse South Polar Stereographic projection -> ``(lat_deg, lon_deg)`` (lon in [0, 360))."""
    rho = math.hypot(x_m, y_m)
    lat = -90.0 + math.degrees(2.0 * math.atan(rho / (2.0 * radius_m)))
    lon = math.degrees(math.atan2(x_m, y_m)) % 360.0 if rho > 0.0 else 0.0
    return lat, lon


# --------------------------------------------------------------------------- terrain grid
def terrain_xy_to_rowcol(x_m: float, y_m: float, width: int, height: int, pixel_size_km: float) -> tuple[float, float]:
    """Map stereographic meters to continuous pixel coords of the pole-centered terrain grid."""
    px_m = pixel_size_km * 1000.0
    col = x_m / px_m + width / 2.0
    row = height / 2.0 - y_m / px_m
    return row, col


def terrain_rowcol_to_xy(row: float, col: float, width: int, height: int, pixel_size_km: float) -> tuple[float, float]:
    px_m = pixel_size_km * 1000.0
    return (col - width / 2.0) * px_m, (height / 2.0 - row) * px_m


def bilinear(dem: np.ndarray, row: np.ndarray | float, col: np.ndarray | float) -> np.ndarray:
    """Vectorized bilinear interpolation identical to ``bilinearCore`` (edge-clamped cells)."""
    h, w = dem.shape
    row = np.asarray(row, dtype=np.float64)
    col = np.asarray(col, dtype=np.float64)
    r0 = np.clip(np.floor(row).astype(np.int64), 0, h - 2)
    c0 = np.clip(np.floor(col).astype(np.int64), 0, w - 2)
    dr = row - r0
    dc = col - c0
    z00 = dem[r0, c0]
    z01 = dem[r0, c0 + 1]
    z10 = dem[r0 + 1, c0]
    z11 = dem[r0 + 1, c0 + 1]
    return (1 - dr) * (1 - dc) * z00 + (1 - dr) * dc * z01 + dr * (1 - dc) * z10 + dr * dc * z11


def compute_horizon_mask(
    dem: np.ndarray,
    obs_row: float,
    obs_col: float,
    resolution_m: float,
    n_azimuths: int = 360,
    max_distance_m: float | None = None,
    observer_height_m: float = 0.0,
    lunar_radius_m: float = LUNAR_RADIUS_M,
) -> np.ndarray:
    """Ray-marched horizon mask (degrees, grid azimuths), vectorized across azimuths.

    Same algorithm as ``lunarpipe.horizon.compute_horizon_mask`` and ``computeHorizonMask``
    of ``horizon-wasm``: unit-pixel steps, bilinear terrain, curvature drop ``d^2 / 2R``.
    """
    dem = np.asarray(dem, dtype=np.float64)
    if dem.ndim != 2:
        raise ValueError(f"DEM must be 2-dimensional, got shape {dem.shape}.")
    h, w = dem.shape
    if h < 2 or w < 2:
        raise ValueError(f"DEM must be at least 2x2 pixels, got {h}x{w}.")
    if not np.all(np.isfinite(dem)):
        raise ValueError("DEM contains non-finite (NaN or Inf) elevation values.")
    if not (math.isfinite(obs_row) and math.isfinite(obs_col)):
        raise ValueError(
            f"Observer coordinates must be finite, got obs_row={obs_row}, obs_col={obs_col}."
        )
    if not (0.0 <= obs_row <= h - 1 and 0.0 <= obs_col <= w - 1):
        raise ValueError(f"Observer ({obs_row:.2f}, {obs_col:.2f}) outside grid [0,{h - 1}]x[0,{w - 1}].")
    if not math.isfinite(resolution_m) or resolution_m <= 0.0:
        raise ValueError(f"resolution_m must be finite and > 0, got {resolution_m}.")
    if isinstance(n_azimuths, bool) or not isinstance(n_azimuths, (int, np.integer)) or n_azimuths < 1:
        raise ValueError(f"n_azimuths must be an integer >= 1, got {n_azimuths}.")
    if not math.isfinite(observer_height_m) or observer_height_m < 0.0:
        raise ValueError(
            f"observer_height_m must be finite and >= 0, got {observer_height_m}."
        )
    if not math.isfinite(lunar_radius_m) or lunar_radius_m <= 0.0:
        raise ValueError(f"lunar_radius_m must be finite and > 0, got {lunar_radius_m}.")
    if max_distance_m is not None and (not math.isfinite(max_distance_m) or max_distance_m <= 0.0):
        raise ValueError(
            f"max_distance_m must be finite and > 0 when provided, got {max_distance_m}."
        )

    n_azimuths = int(n_azimuths)
    z_obs = float(bilinear(dem, obs_row, obs_col)) + observer_height_m
    az = 2.0 * np.pi * np.arange(n_azimuths) / n_azimuths
    dcol = np.sin(az)
    drow = -np.cos(az)
    best = np.full(n_azimuths, -0.5 * np.pi)
    active = np.ones(n_azimuths, dtype=bool)
    inv2r = 1.0 / (2.0 * lunar_radius_m)

    step = 1
    while np.any(active):
        d = step * resolution_m
        if max_distance_m is not None and d > max_distance_m:
            break
        r = obs_row + step * drow
        c = obs_col + step * dcol
        active &= (r >= 0.0) & (r <= h - 1) & (c >= 0.0) & (c <= w - 1)
        if not np.any(active):
            break
        z = bilinear(dem, np.where(active, r, obs_row), np.where(active, c, obs_col))
        ang = np.arctan2(z - d * d * inv2r - z_obs, d)
        best = np.where(active & (ang > best), ang, best)
        step += 1

    return np.degrees(best)


# --------------------------------------------------------------------------- horizon lookup
def interpolate_horizon(mask_deg: np.ndarray, grid_azimuth_deg: np.ndarray | float) -> np.ndarray:
    """Linear interpolation of a circular horizon mask at arbitrary grid azimuths."""
    n = mask_deg.shape[0]
    pos = (np.asarray(grid_azimuth_deg, dtype=np.float64) % 360.0) * (n / 360.0)
    i0 = np.floor(pos).astype(np.int64) % n
    i1 = (i0 + 1) % n
    t = pos - np.floor(pos)
    return (1.0 - t) * mask_deg[i0] + t * mask_deg[i1]


def horizon_in_true_frame(mask_deg: np.ndarray, lon_deg: float) -> np.ndarray:
    """Resample a grid-referenced mask onto true-north azimuths ``k * 360 / n``."""
    n = mask_deg.shape[0]
    true_az = np.arange(n) * (360.0 / n)
    return interpolate_horizon(mask_deg, true_az + lon_deg)


# --------------------------------------------------------------------------- topocentric
def enu_basis(lat_deg: float, lon_deg: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    lat, lon = math.radians(lat_deg), math.radians(lon_deg)
    east = np.array([-math.sin(lon), math.cos(lon), 0.0])
    north = np.array([-math.sin(lat) * math.cos(lon), -math.sin(lat) * math.sin(lon), math.cos(lat)])
    up = np.array([math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)])
    return east, north, up


def site_position_km(lat_deg: float, lon_deg: float, radius_km: float = LUNAR_RADIUS_KM) -> np.ndarray:
    _, _, up = enu_basis(lat_deg, lon_deg)
    return up * radius_km


def topocentric_az_el(vectors: np.ndarray, lat_deg: float, lon_deg: float) -> tuple[np.ndarray, np.ndarray]:
    """True azimuth (clockwise from local north) and elevation (deg) of ``(N, 3)`` MOON_ME vectors."""
    v = np.atleast_2d(np.asarray(vectors, dtype=np.float64))
    norm = np.linalg.norm(v, axis=1)
    norm = np.where(norm > 0, norm, 1.0)
    u = v / norm[:, None]
    east, north, up = enu_basis(lat_deg, lon_deg)
    e, n, z = u @ east, u @ north, u @ up
    el = np.degrees(np.arcsin(np.clip(z, -1.0, 1.0)))
    az = np.degrees(np.arctan2(e, n)) % 360.0
    return az, el


def sub_point_latlon(dirs: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Selenographic lat/lon (deg, lon in [0,360)) of the sub-body point for unit vectors."""
    d = np.atleast_2d(np.asarray(dirs, dtype=np.float64))
    lat = np.degrees(np.arcsin(np.clip(d[:, 2], -1.0, 1.0)))
    lon = np.degrees(np.arctan2(d[:, 1], d[:, 0])) % 360.0
    return lat, lon


# --------------------------------------------------------------------------- solar disk
def solar_disk_fraction(
    sun_elevation_deg: np.ndarray | float,
    horizon_elevation_deg: np.ndarray | float,
    solar_angular_radius_deg: float = DEFAULT_SOLAR_ANGULAR_RADIUS_DEG,
) -> np.ndarray:
    """Vectorized circular-segment visible fraction of the solar disk (``solarDiskFraction``)."""
    if not (solar_angular_radius_deg > 0.0):
        raise ValueError("solar_angular_radius_deg must be > 0.")
    x = (np.asarray(sun_elevation_deg, dtype=np.float64) - np.asarray(horizon_elevation_deg, dtype=np.float64)) / solar_angular_radius_deg
    xc = np.clip(x, -1.0, 1.0)
    frac = 0.5 + (np.arcsin(xc) + xc * np.sqrt(np.maximum(0.0, 1.0 - xc * xc))) / np.pi
    return np.clip(frac, 0.0, 1.0)


def longest_run_seconds(mask: np.ndarray, step_seconds: float) -> float:
    """Duration of the longest run of consecutive ``True`` samples."""
    if mask.size == 0 or not mask.any():
        return 0.0
    padded = np.concatenate(([False], mask.astype(bool), [False]))
    diff = np.diff(padded.astype(np.int8))
    starts = np.flatnonzero(diff == 1)
    ends = np.flatnonzero(diff == -1)
    return float((ends - starts).max()) * step_seconds
