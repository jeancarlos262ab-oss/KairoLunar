"""Unit tests for terrain cropping, block averaging, and NoData/out-of-bounds handling."""

from __future__ import annotations

import numpy as np
import pytest
from affine import Affine

from lunarpipe.dem import create_synthetic_dem
from lunarpipe.terrain import crop_and_downsample_terrain


def test_crop_and_downsample_exact_block_average() -> None:
    # 512x512 DEM at 312.5 m/px covers exactly 160 km x 160 km centered at the south pole.
    dem = create_synthetic_dem(width=512, height=512, resolution_m=312.5, base_elevation_m=100.0)
    # Paint North-West quadrant (top-left) to +200 m.
    dem.heights[:256, :256] = 200.0

    patch = crop_and_downsample_terrain(
        dem=dem.heights,
        transform=dem.transform,
        extent_km=160.0,
        target_size=256,
    )

    assert patch.heights.shape == (256, 256)
    assert patch.heights.dtype == np.float32
    assert patch.pixel_size_km == pytest.approx(160.0 / 256.0)
    assert np.all(np.isfinite(patch.heights))
    assert float(patch.heights[0, 0]) == pytest.approx(200.0)
    assert float(patch.heights[200, 200]) == pytest.approx(100.0)


def test_crop_and_downsample_handles_out_of_bounds_and_nodata_without_nans() -> None:
    # 80x80 DEM at 1000 m/px (80 km x 80 km) cropped to 160 km x 160 km extends beyond DEM borders.
    dem = create_synthetic_dem(width=80, height=80, resolution_m=1000.0, base_elevation_m=42.0)
    dem.heights[:40, :] = 84.0
    dem.heights[10:15, 10:15] = -9999.0  # NoData hole inside valid area
    dem.heights[20, 20] = np.nan

    patch = crop_and_downsample_terrain(
        dem=dem.heights,
        transform=dem.transform,
        extent_km=160.0,
        target_size=160,
        nodata=-9999.0,
    )

    assert patch.heights.shape == (160, 160)
    assert patch.pixel_size_km == pytest.approx(1.0)
    assert np.all(np.isfinite(patch.heights))
    # Interior north pixels still retain 84 m and south pixels retain 42 m.
    assert float(patch.heights[50, 80]) == pytest.approx(84.0)
    assert float(patch.heights[110, 80]) == pytest.approx(42.0)
    # Filled NoData/border regions only take valid terrain values in [42, 84].
    assert float(np.min(patch.heights)) >= 42.0
    assert float(np.max(patch.heights)) <= 84.0


def test_crop_ignores_nodata_within_mixed_block() -> None:
    dem = create_synthetic_dem(width=16, height=16, resolution_m=1000.0, base_elevation_m=50.0)
    # 2x2 block average at top-left: three cells are 50.0, one cell is NoData (-9999.0).
    dem.heights[0, 0] = -9999.0
    dem.heights[0, 1] = 70.0
    dem.heights[1, 0] = 70.0
    dem.heights[1, 1] = 70.0

    patch = crop_and_downsample_terrain(
        dem=dem.heights,
        transform=dem.transform,
        extent_km=16.0,
        target_size=8,
        nodata=-9999.0,
    )

    assert patch.heights.shape == (8, 8)
    assert float(patch.heights[0, 0]) == pytest.approx(70.0)
    assert np.all(np.isfinite(patch.heights))


def test_crop_rejects_non_intersecting_or_all_nodata_windows() -> None:
    transform = Affine(100.0, 0.0, 1_000_000.0, 0.0, -100.0, 1_000_000.0)
    dem = np.zeros((32, 32), dtype=np.float64)

    with pytest.raises(ValueError, match="does not intersect"):
        crop_and_downsample_terrain(dem=dem, transform=transform, extent_km=10.0)

    centered = create_synthetic_dem(width=32, height=32, resolution_m=1000.0, base_elevation_m=0.0)
    centered.heights[:, :] = np.nan
    with pytest.raises(ValueError, match="no valid elevation pixels"):
        crop_and_downsample_terrain(
            dem=centered.heights,
            transform=centered.transform,
            extent_km=32.0,
        )
