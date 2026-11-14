from __future__ import annotations

import importlib
import math
import struct
import sys
import types
from pathlib import Path

import numpy as np
import pytest

from lunarapi import geometry as geo
from lunarapi.readers import BinaryFormatError, parse_ldem, parse_leph, parse_lhor

from conftest import pack_ldem, pack_leph, pack_lhor, synthetic_ephemeris


def _import_lunarpipe(submodule: str):
    """Import ``lunarpipe.<submodule>`` from the sibling pipeline package without skipping."""
    pipeline_src = str(Path(__file__).resolve().parents[2] / "pipeline" / "src")
    if pipeline_src not in sys.path:
        sys.path.insert(0, pipeline_src)
    if "rasterio" not in sys.modules:
        try:
            importlib.import_module("rasterio")
        except ImportError:
            sys.modules["rasterio"] = types.ModuleType("rasterio")
    if "affine" not in sys.modules:
        try:
            importlib.import_module("affine")
        except ImportError:
            affine_mod = types.ModuleType("affine")

            class _StubAffine:
                def __init__(self, a: float, b: float, c: float, d: float, e: float, f: float) -> None:
                    self.a, self.b, self.c, self.d, self.e, self.f = a, b, c, d, e, f

            affine_mod.Affine = _StubAffine  # type: ignore[attr-defined]
            sys.modules["affine"] = affine_mod
    return importlib.import_module(f"lunarpipe.{submodule}")


def test_lhor_roundtrip():
    elev = np.linspace(-5, 5, 8)
    f = parse_lhor(pack_lhor([(-89.5, 10.0, 2.0, elev)], 8))
    assert f.n_azimuths == 8 and len(f.sites) == 1
    np.testing.assert_allclose(f.sites[0].elevations_deg, elev, atol=0.005)
    assert f.sites[0].lat_deg == pytest.approx(-89.5)


def test_ldem_roundtrip_dequantization():
    h = np.random.default_rng(0).uniform(-3000, 2000, (10, 12))
    t = parse_ldem(pack_ldem(h, 1.25))
    assert (t.width, t.height) == (12, 10)
    np.testing.assert_allclose(t.heights_m, h, atol=t.quantization_step_m)


def test_leph_roundtrip():
    sun, earth, dist = synthetic_ephemeris(5)
    e = parse_leph(pack_leph(100.0, 60.0, sun, earth, dist))
    assert e.n_samples == 5 and e.end_unix_utc == 340.0
    np.testing.assert_allclose(e.sun_dirs, sun, atol=1e-6)


def test_bad_magic_and_size():
    with pytest.raises(BinaryFormatError):
        parse_lhor(b"XXXX" + bytes(12))
    good = pack_lhor([(-89.5, 0.0, 2.0, np.zeros(4))], 4)
    with pytest.raises(BinaryFormatError):
        parse_lhor(good[:-1])


def test_corrupted_binary_headers_and_nonfinite_values():
    bad_lhor = pack_lhor([(float("nan"), 0.0, 2.0, np.zeros(4))], 4)
    with pytest.raises(BinaryFormatError, match="non-finite"):
        parse_lhor(bad_lhor)

    bad_ldem_px = struct.pack("<4sHHHHfff8s", b"LDEM", 1, 0, 2, 2, 0.0, 0.0, 1.0, b"\0" * 8) + bytes(8)
    with pytest.raises(BinaryFormatError, match="invalid header"):
        parse_ldem(bad_ldem_px)

    bad_ldem_range = struct.pack("<4sHHHHfff8s", b"LDEM", 1, 0, 2, 2, 1.0, 10.0, 5.0, b"\0" * 8) + bytes(8)
    with pytest.raises(BinaryFormatError, match="invalid header"):
        parse_ldem(bad_ldem_range)

    bad_leph_hdr = struct.pack("<4sHHIdf8s", b"LEPH", 1, 0, 1, float("nan"), 60.0, b"\0" * 8) + bytes(28)
    with pytest.raises(BinaryFormatError, match="invalid timing"):
        parse_leph(bad_leph_hdr)

    sun, earth, dist = synthetic_ephemeris(1)
    sun[0, 0] = float("inf")
    with pytest.raises(BinaryFormatError, match="non-finite"):
        parse_leph(pack_leph(0.0, 60.0, sun, earth, dist))


def test_lunarpipe_writers_compatibility(tmp_path):
    """The API readers must parse files written by the real pipeline serializers."""
    formats = _import_lunarpipe("formats")
    elev = np.array([1.0, -2.5, 3.25, 0.0])
    data = formats.pack_lhor([formats.SiteHorizonRecord(-89.8, 0.0, 2.0, elev)])
    np.testing.assert_allclose(parse_lhor(data).sites[0].elevations_deg, elev)
    h = np.arange(12, dtype=float).reshape(3, 4)
    t = parse_ldem(formats.pack_ldem(h, 0.5))
    np.testing.assert_allclose(t.heights_m, h, atol=1e-3)
    sun, earth, dist = synthetic_ephemeris(3)
    e = parse_leph(formats.pack_leph_arrays(10.0, 3600.0, sun, earth, dist))
    np.testing.assert_allclose(e.earth_distance_km, dist)


def test_solar_disk_fraction_matches_reference():
    assert geo.solar_disk_fraction(1.0, 0.0) == 1.0
    assert geo.solar_disk_fraction(-1.0, 0.0) == 0.0
    assert float(geo.solar_disk_fraction(0.0, 0.0)) == pytest.approx(0.5)
    for x in (-0.7, -0.2, 0.3, 0.9):
        ref = 0.5 + (math.asin(x) + x * math.sqrt(1 - x * x)) / math.pi
        assert float(geo.solar_disk_fraction(x * 0.2666, 0.0)) == pytest.approx(ref)


def test_projection_roundtrip():
    x, y = geo.latlon_to_xy(-89.45, 222.5)
    lat, lon = geo.xy_to_latlon(x, y)
    assert lat == pytest.approx(-89.45) and lon == pytest.approx(222.5)


def test_topocentric_up_and_north():
    lat, lon = -89.0, 30.0
    _, _, up = geo.enu_basis(lat, lon)
    _, el = geo.topocentric_az_el(up, lat, lon)
    assert el[0] == pytest.approx(90.0)
    # At the south pole region, true north points away from the pole (grid azimuth == lon).
    _, north, _ = geo.enu_basis(lat, lon)
    az, el = geo.topocentric_az_el(north, lat, lon)
    assert az[0] == pytest.approx(0.0, abs=1e-9) and el[0] == pytest.approx(0.0, abs=1e-9)


def test_grid_to_true_frame():
    mask = np.zeros(360)
    mask[90] = 7.0  # bump at grid azimuth 90
    true_mask = geo.horizon_in_true_frame(mask, 90.0)
    assert true_mask[0] == pytest.approx(7.0)


def test_horizon_mask_flat_and_wall():
    flat = np.zeros((41, 41))
    m = geo.compute_horizon_mask(flat, 20, 20, 100.0, n_azimuths=8)
    assert np.all(m < 0) and np.all(m > -1)  # only curvature drop
    wall = flat.copy()
    wall[10, :] = 500.0  # wall 10 px north
    m = geo.compute_horizon_mask(wall, 20, 20, 100.0, n_azimuths=4)
    assert m[0] == pytest.approx(math.degrees(math.atan2(500 - 1000**2 / (2 * geo.LUNAR_RADIUS_M), 1000)), abs=1e-6)


def test_horizon_mask_matches_lunarpipe():
    horizon = _import_lunarpipe("horizon")
    rng = np.random.default_rng(1)
    dem = rng.uniform(0, 300, (30, 30))
    ours = geo.compute_horizon_mask(dem, 14.3, 15.7, 50.0, 72, None, 2.0)
    ref = horizon.compute_horizon_mask(dem, 14.3, 15.7, 50.0, 72, None, 2.0)
    np.testing.assert_allclose(ours, ref, atol=1e-4)


def test_south_pole_terrain_pixel_matches_lunarpipe():
    dem_mod = _import_lunarpipe("dem")
    width, height, px_km = 64, 64, 0.5
    syn = dem_mod.create_synthetic_dem(width=width, height=height, resolution_m=px_km * 1000.0)
    for lat, lon in [(-90.0, 0.0), (-89.45, 222.5), (-89.8, 30.0)]:
        ref_row, ref_col = dem_mod.latlon_to_rowcol(lat, lon, syn.transform)
        x_m, y_m = geo.latlon_to_xy(lat, lon)
        row, col = geo.terrain_xy_to_rowcol(x_m, y_m, width, height, px_km)
        assert row == pytest.approx(ref_row, abs=1e-9)
        assert col == pytest.approx(ref_col, abs=1e-9)
        rx, ry = geo.terrain_rowcol_to_xy(row, col, width, height, px_km)
        assert rx == pytest.approx(x_m, abs=1e-6) and ry == pytest.approx(y_m, abs=1e-6)
    pole_row, pole_col = geo.terrain_xy_to_rowcol(*geo.latlon_to_xy(-90.0, 0.0), width, height, px_km)
    assert (pole_row, pole_col) == (32.0, 32.0)


def test_compute_horizon_mask_validation():
    dem = np.zeros((16, 16), dtype=np.float64)
    bad = dem.copy()
    bad[2, 2] = np.nan
    with pytest.raises(ValueError, match="non-finite"):
        geo.compute_horizon_mask(bad, 8.0, 8.0, 10.0)
    with pytest.raises(ValueError, match="resolution_m"):
        geo.compute_horizon_mask(dem, 8.0, 8.0, 0.0)
    with pytest.raises(ValueError, match="n_azimuths"):
        geo.compute_horizon_mask(dem, 8.0, 8.0, 10.0, n_azimuths=0)
    with pytest.raises(ValueError, match="observer_height_m"):
        geo.compute_horizon_mask(dem, 8.0, 8.0, 10.0, observer_height_m=-1.0)
    with pytest.raises(ValueError, match="outside grid"):
        geo.compute_horizon_mask(dem, -0.1, 8.0, 10.0)
