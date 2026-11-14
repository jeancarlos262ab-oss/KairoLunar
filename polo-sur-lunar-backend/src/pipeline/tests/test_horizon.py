"""Unit tests for DEM projection, ray-marched horizon masks, and solar disk fraction."""

from __future__ import annotations

import math

import numpy as np
import pytest
from affine import Affine

from lunarpipe.dem import (
    LUNAR_RADIUS_M,
    create_synthetic_dem,
    latlon_to_rowcol,
    latlon_to_xy,
    read_dem,
    validate_transform,
)
from lunarpipe.horizon import (
    HAS_NUMBA,
    _raymarch_horizon_kernel,
    compute_horizon_mask,
    solar_disk_visible_fraction,
)


def test_south_pole_projects_to_origin() -> None:
    x, y = latlon_to_xy(-90.0, 0.0)
    assert x == 0.0
    assert y == 0.0

    x_rot, y_rot = latlon_to_xy(-90.0, 137.5)
    assert x_rot == 0.0
    assert y_rot == 0.0

    dem = create_synthetic_dem(width=64, height=64, resolution_m=20.0)
    row, col = latlon_to_rowcol(-90.0, 0.0, dem.transform)
    assert row == pytest.approx(32.0)
    assert col == pytest.approx(32.0)


def test_transform_validation_rejects_rotated_and_nonsquare() -> None:
    rotated = Affine(10.0, 1.0, -100.0, 0.0, -10.0, 100.0)
    with pytest.raises(ValueError, match="Rotated or sheared"):
        validate_transform(rotated)

    nonsquare = Affine(10.0, 0.0, -100.0, 0.0, -20.0, 100.0)
    with pytest.raises(ValueError, match="Non-square"):
        validate_transform(nonsquare)

    flipped_y = Affine(10.0, 0.0, -100.0, 0.0, 10.0, -100.0)
    with pytest.raises(ValueError, match="north-up"):
        validate_transform(flipped_y)


def test_read_dem_geotiff_and_nodata_handling(tmp_path) -> None:
    rasterio = pytest.importorskip("rasterio")
    tif_path = tmp_path / "sample.tif"
    transform = Affine(25.0, 0.0, -400.0, 0.0, -25.0, 400.0)
    arr = np.full((32, 32), 120.0, dtype=np.float32)
    arr[0, 0] = -9999.0

    with rasterio.open(
        tif_path,
        "w",
        driver="GTiff",
        height=32,
        width=32,
        count=1,
        dtype="float32",
        transform=transform,
        nodata=-9999.0,
    ) as dst:
        dst.write(arr, 1)

    loaded = read_dem(tif_path)
    heights, res_m, loaded_tf = loaded
    assert res_m == pytest.approx(25.0)
    assert loaded_tf == transform
    assert np.isnan(heights[0, 0])
    assert heights[10, 10] == pytest.approx(120.0)


def test_ridge_10m_at_1km_matches_geometric_elevation() -> None:
    dem = create_synthetic_dem(
        width=256,
        height=256,
        resolution_m=10.0,
        base_elevation_m=0.0,
        ridge_height_m=10.0,
        ridge_distance_m=1000.0,
        ridge_azimuth_deg=0.0,
        ridge_thickness_px=1,
    )
    center_row = dem.heights.shape[0] // 2
    center_col = dem.heights.shape[1] // 2

    mask = compute_horizon_mask(
        dem=dem.heights,
        obs_row=float(center_row),
        obs_col=float(center_col),
        resolution_m=dem.resolution_m,
        n_azimuths=360,
        observer_height_m=0.0,
    )

    d = 1000.0
    z_corr = 10.0 - (d * d) / (2.0 * LUNAR_RADIUS_M)
    expected_deg = math.degrees(math.atan2(z_corr, d))

    # Azimuth index 0 corresponds to due north (0 deg).
    assert abs(float(mask[0]) - expected_deg) < 0.01
    assert float(mask[0]) == pytest.approx(expected_deg, abs=1e-4)
    # Due south (180 deg) has no ridge, only flat terrain curvature.
    assert float(mask[180]) < 0.0


def test_lunar_curvature_on_flat_terrain() -> None:
    dem = create_synthetic_dem(width=201, height=201, resolution_m=100.0, base_elevation_m=50.0)
    mask_zero = compute_horizon_mask(
        dem=dem.heights,
        obs_row=100.0,
        obs_col=100.0,
        resolution_m=dem.resolution_m,
        n_azimuths=36,
        observer_height_m=0.0,
    )
    expected_step1_deg = math.degrees(
        math.atan2(-(100.0 * 100.0) / (2.0 * LUNAR_RADIUS_M), 100.0)
    )
    assert np.all(mask_zero < 0.0)
    assert np.allclose(mask_zero, expected_step1_deg, atol=1e-5)

    # With an elevated observer on flat terrain, maximum angle peaks at the spherical horizon d = sqrt(2*R*h).
    obs_h = 10.0
    mask_elev = compute_horizon_mask(
        dem=dem.heights,
        obs_row=100.0,
        obs_col=100.0,
        resolution_m=dem.resolution_m,
        n_azimuths=36,
        observer_height_m=obs_h,
    )
    expected_horizon_deg = math.degrees(math.atan2(-math.sqrt(2.0 * obs_h / LUNAR_RADIUS_M), 1.0))
    assert np.all(mask_elev < mask_zero)
    assert np.allclose(mask_elev, expected_horizon_deg, atol=0.01)


def test_raising_observer_reduces_apparent_ridge_elevation() -> None:
    dem = create_synthetic_dem(
        width=256,
        height=256,
        resolution_m=10.0,
        base_elevation_m=0.0,
        ridge_height_m=20.0,
        ridge_distance_m=1000.0,
        ridge_azimuth_deg=0.0,
    )
    mask_low = compute_horizon_mask(
        dem.heights, 128.0, 128.0, dem.resolution_m, n_azimuths=72, observer_height_m=0.0
    )
    mask_high = compute_horizon_mask(
        dem.heights, 128.0, 128.0, dem.resolution_m, n_azimuths=72, observer_height_m=5.0
    )

    assert float(mask_high[0]) < float(mask_low[0])
    d = 1000.0
    z_corr = 20.0 - (d * d) / (2.0 * LUNAR_RADIUS_M)
    expected_low = math.degrees(math.atan2(z_corr, d))
    expected_high = math.degrees(math.atan2(z_corr - 5.0, d))
    assert float(mask_low[0]) == pytest.approx(expected_low, abs=1e-4)
    assert float(mask_high[0]) == pytest.approx(expected_high, abs=1e-4)


def test_horizon_python_fallback_matches_numba_if_present() -> None:
    dem = create_synthetic_dem(
        width=128,
        height=128,
        resolution_m=20.0,
        ridge_height_m=15.0,
        ridge_distance_m=500.0,
        ridge_azimuth_deg=90.0,
    )
    fast = compute_horizon_mask(dem.heights, 64.0, 64.0, dem.resolution_m, n_azimuths=36)
    if HAS_NUMBA:
        py_out = _raymarch_horizon_kernel.py_func(
            np.ascontiguousarray(dem.heights, dtype=np.float64),
            64.0,
            64.0,
            20.0,
            36,
            -1.0,
            0.0,
            LUNAR_RADIUS_M,
        )
        assert np.allclose(fast, py_out, atol=1e-6)


def test_horizon_validation_errors() -> None:
    dem = create_synthetic_dem(width=16, height=16, resolution_m=10.0)
    bad = dem.heights.copy()
    bad[4, 4] = np.nan
    with pytest.raises(ValueError, match="non-finite"):
        compute_horizon_mask(bad, 8.0, 8.0, 10.0)

    with pytest.raises(ValueError, match="outside DEM bounds"):
        compute_horizon_mask(dem.heights, -0.1, 8.0, 10.0)

    with pytest.raises(ValueError, match="resolution_m"):
        compute_horizon_mask(dem.heights, 8.0, 8.0, 0.0)

    with pytest.raises(ValueError, match="n_azimuths"):
        compute_horizon_mask(dem.heights, 8.0, 8.0, 10.0, n_azimuths=0)


def test_solar_disk_visible_fraction_limits_and_symmetry() -> None:
    r = 0.2666
    assert solar_disk_visible_fraction(0.0, 0.5, r) == 0.0
    assert solar_disk_visible_fraction(1.0 - r, 1.0, r) == pytest.approx(0.0, abs=1e-12)
    assert solar_disk_visible_fraction(1.0, 1.0, r) == pytest.approx(0.5, abs=1e-12)
    assert solar_disk_visible_fraction(1.0 + r, 1.0, r) == pytest.approx(1.0, abs=1e-12)
    assert solar_disk_visible_fraction(2.0, 1.0, r) == 1.0

    f_low = solar_disk_visible_fraction(1.0 - 0.5 * r, 1.0, r)
    f_high = solar_disk_visible_fraction(1.0 + 0.5 * r, 1.0, r)
    assert 0.0 < f_low < 0.5 < f_high < 1.0
    assert f_low + f_high == pytest.approx(1.0, abs=1e-12)
