"""Ray-marched lunar horizon mask and solar disk visible fraction computations."""

from __future__ import annotations

import math

import numpy as np

from lunarpipe.dem import LUNAR_RADIUS_M

try:
    from numba import njit

    HAS_NUMBA = True
except ImportError:  # pragma: no cover
    HAS_NUMBA = False

    def njit(*args, **kwargs):  # type: ignore[no-redef]
        if args and callable(args[0]) and len(args) == 1 and not kwargs:
            return args[0]

        def decorator(fn):
            return fn

        return decorator


@njit(cache=True)
def _bilinear_interpolate_kernel(
    dem: np.ndarray, row: float, col: float, height: int, width: int
) -> float:
    r0 = int(math.floor(row))
    if r0 < 0:
        r0 = 0
    elif r0 >= height - 1:
        r0 = height - 2
    r1 = r0 + 1
    dr = row - float(r0)

    c0 = int(math.floor(col))
    if c0 < 0:
        c0 = 0
    elif c0 >= width - 1:
        c0 = width - 2
    c1 = c0 + 1
    dc = col - float(c0)

    z00 = dem[r0, c0]
    z01 = dem[r0, c1]
    z10 = dem[r1, c0]
    z11 = dem[r1, c1]

    return (
        (1.0 - dr) * (1.0 - dc) * z00
        + (1.0 - dr) * dc * z01
        + dr * (1.0 - dc) * z10
        + dr * dc * z11
    )


@njit(cache=True)
def _raymarch_horizon_kernel(
    dem: np.ndarray,
    obs_row: float,
    obs_col: float,
    resolution_m: float,
    n_azimuths: int,
    max_distance_m: float,
    observer_height_m: float,
    lunar_radius_m: float,
) -> np.ndarray:
    height, width = dem.shape
    out = np.empty(n_azimuths, dtype=np.float32)

    z_obs = (
        _bilinear_interpolate_kernel(dem, obs_row, obs_col, height, width)
        + observer_height_m
    )

    max_row = float(height - 1)
    max_col = float(width - 1)
    inv_2r = 1.0 / (2.0 * lunar_radius_m)

    for i in range(n_azimuths):
        az_rad = (2.0 * math.pi * float(i)) / float(n_azimuths)
        dcol = math.sin(az_rad)
        drow = -math.cos(az_rad)

        best_angle_rad = -0.5 * math.pi
        step = 1
        while True:
            d = float(step) * resolution_m
            if max_distance_m > 0.0 and d > max_distance_m:
                break

            r = obs_row + float(step) * drow
            c = obs_col + float(step) * dcol
            if r < 0.0 or r > max_row or c < 0.0 or c > max_col:
                break

            z_terrain = _bilinear_interpolate_kernel(dem, r, c, height, width)
            z_corr = z_terrain - (d * d) * inv_2r
            angle_rad = math.atan2(z_corr - z_obs, d)
            if angle_rad > best_angle_rad:
                best_angle_rad = angle_rad

            step += 1

        out[i] = np.float32(math.degrees(best_angle_rad))

    return out


def bilinear_interpolate(dem: np.ndarray, row: float, col: float) -> float:
    """Bilinearly interpolate elevation in meters at continuous ``(row, col)`` on a 2D DEM.

    Args:
        dem: 2D array of finite terrain elevations in meters with shape ``(height, width)``.
        row: Continuous row index in ``[0, height - 1]``.
        col: Continuous column index in ``[0, width - 1]``.

    Returns:
        Interpolated elevation in meters.

    Raises:
        ValueError: If ``dem`` is not 2D, smaller than 2x2, contains non-finite values,
            or ``(row, col)`` is non-finite or out of bounds.
    """
    arr = np.asarray(dem, dtype=np.float64)
    if arr.ndim != 2:
        raise ValueError(f"DEM must be 2-dimensional, got shape {arr.shape}.")
    height, width = arr.shape
    if height < 2 or width < 2:
        raise ValueError(f"DEM must be at least 2x2, got {height}x{width}.")
    if not np.all(np.isfinite(arr)):
        raise ValueError("DEM contains non-finite (NaN or Inf) elevation values.")
    if not (math.isfinite(row) and math.isfinite(col)):
        raise ValueError(f"Coordinates must be finite, got row={row}, col={col}.")
    if row < 0.0 or row > float(height - 1) or col < 0.0 or col > float(width - 1):
        raise ValueError(
            f"Coordinates (row={row}, col={col}) are outside DEM bounds "
            f"[0, {height - 1}] x [0, {width - 1}]."
        )

    return float(_bilinear_interpolate_kernel(np.ascontiguousarray(arr), float(row), float(col), height, width))


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
    """Compute a 360-degree (or ``n_azimuths``) horizon elevation mask in degrees via ray marching.

    Azimuths start at north (``0 deg``, decreasing row) and increase clockwise
    (``90 deg`` is east, increasing column). Elevations are corrected for lunar
    curvature via ``z_corr = z_terrain - d^2 / (2 * lunar_radius_m)``.

    Args:
        dem: 2D array of finite elevations in meters, shape ``(height, width)``.
        obs_row: Observer row coordinate in ``[0, height - 1]``.
        obs_col: Observer column coordinate in ``[0, width - 1]``.
        resolution_m: Square pixel spacing in meters per pixel (must be ``> 0``).
        n_azimuths: Number of equally spaced azimuth rays (must be ``>= 1``).
        max_distance_m: Optional maximum ray-march distance in meters (``> 0``).
            If ``None``, rays march to the DEM border.
        observer_height_m: Height of the observer above terrain surface in meters (``>= 0``).
        lunar_radius_m: Lunar radius in meters used for curvature correction (``> 0``).

    Returns:
        1D ``float32`` array of length ``n_azimuths`` containing maximum horizon
        elevation angles in degrees.

    Raises:
        ValueError: If any array dimension, coordinate, resolution, or parameter is invalid
            or non-finite.
    """
    arr = np.ascontiguousarray(dem, dtype=np.float64)
    if arr.ndim != 2:
        raise ValueError(f"DEM must be 2-dimensional, got shape {arr.shape}.")
    height, width = arr.shape
    if height < 2 or width < 2:
        raise ValueError(f"DEM must be at least 2x2 pixels, got {height}x{width}.")
    if not np.all(np.isfinite(arr)):
        raise ValueError("DEM contains non-finite (NaN or Inf) elevation values.")

    if not (math.isfinite(obs_row) and math.isfinite(obs_col)):
        raise ValueError(
            f"Observer coordinates must be finite, got obs_row={obs_row}, obs_col={obs_col}."
        )
    if obs_row < 0.0 or obs_row > float(height - 1) or obs_col < 0.0 or obs_col > float(width - 1):
        raise ValueError(
            f"Observer coordinates ({obs_row}, {obs_col}) lie outside DEM bounds "
            f"[0, {height - 1}] x [0, {width - 1}]."
        )

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

    if max_distance_m is None:
        max_dist = -1.0
    else:
        if not math.isfinite(max_distance_m) or max_distance_m <= 0.0:
            raise ValueError(
                f"max_distance_m must be finite and > 0 when provided, got {max_distance_m}."
            )
        max_dist = float(max_distance_m)

    return _raymarch_horizon_kernel(
        arr,
        float(obs_row),
        float(obs_col),
        float(resolution_m),
        int(n_azimuths),
        max_dist,
        float(observer_height_m),
        float(lunar_radius_m),
    )


def solar_disk_visible_fraction(
    sun_center_elevation_deg: float,
    horizon_elevation_deg: float,
    solar_angular_radius_deg: float = 0.2666,
) -> float:
    """Compute the visible fraction ``[0, 1]`` of the solar disk above the horizon.

    Uses the circular-segment model with normalized center offset
    ``x = (sun_center_elevation_deg - horizon_elevation_deg) / solar_angular_radius_deg``.

    Args:
        sun_center_elevation_deg: Solar center elevation angle in degrees.
        horizon_elevation_deg: Horizon mask elevation angle in degrees.
        solar_angular_radius_deg: Apparent angular radius of the solar disk in degrees (``> 0``).

    Returns:
        Fraction of the solar disk area above the horizon, in ``[0.0, 1.0]``.
    """
    if not (
        math.isfinite(sun_center_elevation_deg)
        and math.isfinite(horizon_elevation_deg)
        and math.isfinite(solar_angular_radius_deg)
    ):
        raise ValueError("Solar elevation, horizon elevation, and solar radius must be finite.")
    if solar_angular_radius_deg <= 0.0:
        raise ValueError(
            f"solar_angular_radius_deg must be > 0, got {solar_angular_radius_deg}."
        )

    x = (sun_center_elevation_deg - horizon_elevation_deg) / solar_angular_radius_deg
    if x <= -1.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    frac = 0.5 + (math.asin(x) + x * math.sqrt(max(0.0, 1.0 - x * x))) / math.pi
    return float(min(1.0, max(0.0, frac)))
