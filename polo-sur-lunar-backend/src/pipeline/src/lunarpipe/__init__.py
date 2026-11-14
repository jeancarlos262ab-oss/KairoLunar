"""Lunar south pole data processing and binary export pipeline."""

from lunarpipe.dem import (
    LUNAR_RADIUS_M,
    DEMData,
    create_synthetic_dem,
    latlon_to_rowcol,
    latlon_to_xy,
    read_dem,
    validate_transform,
    xy_to_rowcol,
)
from lunarpipe.ephemeris import EphemerisData, compute_ephemeris
from lunarpipe.formats import (
    pack_ldem,
    pack_leph,
    pack_lhor,
    write_ldem,
    write_leph,
    write_lhor,
)
from lunarpipe.horizon import (
    HAS_NUMBA,
    bilinear_interpolate,
    compute_horizon_mask,
    solar_disk_visible_fraction,
)
from lunarpipe.kernels import REQUIRED_KERNELS, ensure_kernels
from lunarpipe.terrain import TerrainPatch, crop_and_downsample_terrain

__all__ = [
    "DEMData",
    "EphemerisData",
    "HAS_NUMBA",
    "LUNAR_RADIUS_M",
    "REQUIRED_KERNELS",
    "TerrainPatch",
    "bilinear_interpolate",
    "compute_ephemeris",
    "compute_horizon_mask",
    "create_synthetic_dem",
    "crop_and_downsample_terrain",
    "ensure_kernels",
    "latlon_to_rowcol",
    "latlon_to_xy",
    "pack_ldem",
    "pack_leph",
    "pack_lhor",
    "read_dem",
    "solar_disk_visible_fraction",
    "validate_transform",
    "write_ldem",
    "write_leph",
    "write_lhor",
    "xy_to_rowcol",
]
