"""DEM loading, validation, and lunar south polar stereographic projection utilities."""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, overload

import numpy as np
import rasterio
from affine import Affine

LUNAR_RADIUS_M: float = 1_737_400.0
"""Mean lunar radius in meters used by the South Polar Stereographic projection."""


@dataclass(frozen=True)
class DEMData:
    """Container for a loaded or synthetic Digital Elevation Model.

    Attributes:
        heights: 2D array of terrain elevations in meters (shape ``(height, width)``).
            Row 0 is north and columns increase eastward. Non-valid/NoData pixels are ``NaN``.
        resolution_m: Square pixel size in meters per pixel.
        transform: GeoTIFF affine transform mapping ``(col, row)`` to projected ``(x, y)``
            coordinates in meters.
        nodata: Original NoData sentinel value from the raster metadata, if any.
    """

    heights: np.ndarray
    resolution_m: float
    transform: Affine
    nodata: float | None = None

    def __iter__(self) -> Iterator[object]:
        """Allow unpacking as ``heights, resolution_m, transform``."""
        yield self.heights
        yield self.resolution_m
        yield self.transform

    def __len__(self) -> int:
        return 3


def validate_transform(transform: Affine) -> float:
    """Validate that a raster affine transform is unrotated, north-up, and square-pixel.

    Args:
        transform: Affine transformation (maps pixel ``(col, row)`` to meters ``(x, y)``).

    Returns:
        The square pixel resolution in meters per pixel (positive).

    Raises:
        TypeError: If ``transform`` is not an :class:`affine.Affine` instance.
        ValueError: If the transform contains non-finite values, rotation/shear,
            non-standard axis orientation, or non-square pixels.
    """
    if not isinstance(transform, Affine):
        raise TypeError(f"Expected an affine.Affine transform, got {type(transform).__name__}.")

    coeffs = (transform.a, transform.b, transform.c, transform.d, transform.e, transform.f)
    if not all(math.isfinite(float(v)) for v in coeffs):
        raise ValueError(f"DEM affine transform contains non-finite coefficients: {coeffs}.")

    if abs(transform.b) > 1e-9 or abs(transform.d) > 1e-9:
        raise ValueError(
            "Rotated or sheared DEM transforms are not supported "
            f"(b={transform.b}, d={transform.d})."
        )

    if transform.a <= 0.0 or transform.e >= 0.0:
        raise ValueError(
            "DEM transform must be north-up with eastward-increasing columns "
            f"(expected a > 0 and e < 0, got a={transform.a}, e={transform.e})."
        )

    px_x = abs(float(transform.a))
    px_y = abs(float(transform.e))
    if abs(px_x - px_y) > 1e-6 * px_x:
        raise ValueError(
            f"Non-square DEM pixels are not supported (dx={px_x} m, dy={px_y} m)."
        )

    return px_x


def read_dem(path: str | Path, band: int = 1) -> DEMData:
    """Read an elevation GeoTIFF band in meters and convert NoData/masks to ``NaN``.

    Args:
        path: Path to the GeoTIFF DEM file (elevations in meters, projected meters CRS).
        band: 1-based band index to read (default ``1``).

    Returns:
        A :class:`DEMData` object with ``float64`` elevations in meters.

    Raises:
        FileNotFoundError: If ``path`` does not exist.
        ValueError: If the band index is invalid, the raster dimensions are empty,
            or the affine transform is unsupported.
    """
    dem_path = Path(path)
    if not dem_path.is_file():
        raise FileNotFoundError(f"DEM file not found: {dem_path}")

    with rasterio.open(dem_path) as src:
        if band < 1 or band > src.count:
            raise ValueError(
                f"Invalid band {band}; dataset {dem_path} has {src.count} band(s)."
            )
        if src.width < 2 or src.height < 2:
            raise ValueError(
                f"DEM dimensions must be at least 2x2 pixels, got {src.width}x{src.height}."
            )

        resolution_m = validate_transform(src.transform)
        masked = src.read(band, masked=True)
        raw_data = np.asarray(masked.data, dtype=np.float64)
        mask = np.ma.getmaskarray(masked) | ~np.isfinite(raw_data)
        heights = np.where(mask, np.nan, raw_data)

        nodata = float(src.nodata) if src.nodata is not None else None
        return DEMData(
            heights=heights,
            resolution_m=resolution_m,
            transform=src.transform,
            nodata=nodata,
        )


@overload
def latlon_to_xy(
    lat_deg: float,
    lon_deg: float,
    lunar_radius_m: float = LUNAR_RADIUS_M,
) -> tuple[float, float]: ...


@overload
def latlon_to_xy(
    lat_deg: np.ndarray,
    lon_deg: np.ndarray,
    lunar_radius_m: float = LUNAR_RADIUS_M,
) -> tuple[np.ndarray, np.ndarray]: ...


def latlon_to_xy(
    lat_deg: float | np.ndarray,
    lon_deg: float | np.ndarray,
    lunar_radius_m: float = LUNAR_RADIUS_M,
) -> tuple[float, float] | tuple[np.ndarray, np.ndarray]:
    """Convert selenographic latitude/longitude (degrees) to South Polar Stereographic meters.

    Uses the standard South Polar Stereographic equations with lunar radius ``1_737_400 m``:

    - ``colatitude = radians(90 + lat_deg)``
    - ``rho = 2 * lunar_radius_m * tan(colatitude / 2)``
    - ``x = rho * sin(radians(lon_deg))`` (eastward meters)
    - ``y = rho * cos(radians(lon_deg))`` (northward along 0 deg longitude in meters)

    Args:
        lat_deg: Selenographic latitude in degrees, in ``[-90, 90)``.
        lon_deg: Selenographic longitude in degrees, in ``[-360, 360]``.
        lunar_radius_m: Lunar sphere radius in meters (default ``1_737_400.0``).

    Returns:
        ``(x_m, y_m)`` in projected meters as floats (for scalar inputs) or NumPy arrays.

    Raises:
        ValueError: If inputs are non-finite, out of range, or ``lunar_radius_m <= 0``.
    """
    if not math.isfinite(lunar_radius_m) or lunar_radius_m <= 0.0:
        raise ValueError(f"lunar_radius_m must be finite and > 0, got {lunar_radius_m}.")

    scalar_input = np.isscalar(lat_deg) and np.isscalar(lon_deg)
    lat_arr = np.asarray(lat_deg, dtype=np.float64)
    lon_arr = np.asarray(lon_deg, dtype=np.float64)

    if not (np.all(np.isfinite(lat_arr)) and np.all(np.isfinite(lon_arr))):
        raise ValueError("Latitude and longitude must be finite values.")
    if np.any(lat_arr < -90.0) or np.any(lat_arr >= 90.0):
        raise ValueError("Latitude must be in [-90, 90) degrees for South Polar Stereographic.")
    if np.any(lon_arr < -360.0) or np.any(lon_arr > 360.0):
        raise ValueError("Longitude must be in [-360, 360] degrees.")

    colat_rad = np.radians(90.0 + lat_arr)
    rho = 2.0 * lunar_radius_m * np.tan(colat_rad / 2.0)
    lon_rad = np.radians(lon_arr)
    x = rho * np.sin(lon_rad)
    y = rho * np.cos(lon_rad)

    at_pole = lat_arr == -90.0
    if np.any(at_pole):
        x = np.where(at_pole, 0.0, x)
        y = np.where(at_pole, 0.0, y)

    if scalar_input:
        return float(x), float(y)
    return x, y


@overload
def xy_to_rowcol(
    x_m: float,
    y_m: float,
    transform: Affine,
) -> tuple[float, float]: ...


@overload
def xy_to_rowcol(
    x_m: np.ndarray,
    y_m: np.ndarray,
    transform: Affine,
) -> tuple[np.ndarray, np.ndarray]: ...


def xy_to_rowcol(
    x_m: float | np.ndarray,
    y_m: float | np.ndarray,
    transform: Affine,
) -> tuple[float, float] | tuple[np.ndarray, np.ndarray]:
    """Convert projected stereographic coordinates (meters) to continuous ``(row, col)`` pixels.

    Args:
        x_m: Projected X coordinate(s) in meters.
        y_m: Projected Y coordinate(s) in meters.
        transform: Validated affine transform of the DEM raster.

    Returns:
        ``(row, col)`` continuous pixel coordinates consistent with ``transform``.

    Raises:
        ValueError: If ``transform`` is unsupported or ``x_m``/``y_m`` contain non-finite values.
    """
    validate_transform(transform)
    scalar_input = np.isscalar(x_m) and np.isscalar(y_m)
    x_arr = np.asarray(x_m, dtype=np.float64)
    y_arr = np.asarray(y_m, dtype=np.float64)

    if not (np.all(np.isfinite(x_arr)) and np.all(np.isfinite(y_arr))):
        raise ValueError("Projected coordinates (x_m, y_m) must be finite.")

    col = (x_arr - float(transform.c)) / float(transform.a)
    row = (y_arr - float(transform.f)) / float(transform.e)

    if scalar_input:
        return float(row), float(col)
    return row, col


def latlon_to_rowcol(
    lat_deg: float | np.ndarray,
    lon_deg: float | np.ndarray,
    transform: Affine,
    lunar_radius_m: float = LUNAR_RADIUS_M,
) -> tuple[float, float] | tuple[np.ndarray, np.ndarray]:
    """Convert selenographic ``(lat_deg, lon_deg)`` directly to DEM ``(row, col)`` coordinates."""
    x_m, y_m = latlon_to_xy(lat_deg, lon_deg, lunar_radius_m=lunar_radius_m)
    return xy_to_rowcol(x_m, y_m, transform)


def create_synthetic_dem(
    width: int = 256,
    height: int = 256,
    resolution_m: float = 10.0,
    base_elevation_m: float = 0.0,
    ridge_height_m: float | None = None,
    ridge_distance_m: float = 1000.0,
    ridge_azimuth_deg: float = 0.0,
    ridge_thickness_px: int = 1,
) -> DEMData:
    """Create a synthetic flat DEM centered on the lunar south pole, with an optional ridge.

    The south pole ``(x=0, y=0)`` maps to pixel ``(row=height // 2, col=width // 2)``.

    Args:
        width: Raster width in pixels (must be ``>= 2``).
        height: Raster height in pixels (must be ``>= 2``).
        resolution_m: Square pixel resolution in meters per pixel (must be ``> 0``).
        base_elevation_m: Uniform background elevation in meters.
        ridge_height_m: Optional ridge height in meters added above ``base_elevation_m``.
        ridge_distance_m: Distance from the south pole center to the ridge in meters.
        ridge_azimuth_deg: Azimuth from north (clockwise, degrees) from the pole toward the ridge.
        ridge_thickness_px: Thickness of the synthetic ridge in pixels (must be ``>= 1``).

    Returns:
        A :class:`DEMData` instance with ``float64`` elevations in meters.

    Raises:
        ValueError: If dimensions, resolution, or ridge parameters are invalid.
    """
    if width < 2 or height < 2:
        raise ValueError(f"Synthetic DEM dimensions must be >= 2x2, got {width}x{height}.")
    if not math.isfinite(resolution_m) or resolution_m <= 0.0:
        raise ValueError(f"resolution_m must be finite and > 0, got {resolution_m}.")
    if not math.isfinite(base_elevation_m):
        raise ValueError(f"base_elevation_m must be finite, got {base_elevation_m}.")

    heights = np.full((height, width), float(base_elevation_m), dtype=np.float64)
    center_row = height // 2
    center_col = width // 2
    transform = Affine(
        float(resolution_m),
        0.0,
        -float(center_col) * float(resolution_m),
        0.0,
        -float(resolution_m),
        float(center_row) * float(resolution_m),
    )

    if ridge_height_m is not None:
        if not math.isfinite(ridge_height_m):
            raise ValueError(f"ridge_height_m must be finite, got {ridge_height_m}.")
        if not math.isfinite(ridge_distance_m) or ridge_distance_m <= 0.0:
            raise ValueError(f"ridge_distance_m must be finite and > 0, got {ridge_distance_m}.")
        if not math.isfinite(ridge_azimuth_deg):
            raise ValueError(f"ridge_azimuth_deg must be finite, got {ridge_azimuth_deg}.")
        if ridge_thickness_px < 1:
            raise ValueError(f"ridge_thickness_px must be >= 1, got {ridge_thickness_px}.")

        az_rad = math.radians(ridge_azimuth_deg)
        drow = -math.cos(az_rad)
        dcol = math.sin(az_rad)
        ridge_dist_px = ridge_distance_m / float(resolution_m)

        rows, cols = np.indices((height, width), dtype=np.float64)
        proj = (rows - float(center_row)) * drow + (cols - float(center_col)) * dcol
        mask = np.abs(proj - ridge_dist_px) <= (0.5 * float(ridge_thickness_px))
        heights[mask] += float(ridge_height_m)

    return DEMData(
        heights=heights,
        resolution_m=float(resolution_m),
        transform=transform,
        nodata=None,
    )
