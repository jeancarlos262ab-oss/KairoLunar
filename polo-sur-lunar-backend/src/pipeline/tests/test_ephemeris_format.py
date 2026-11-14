"""Unit tests for binary formats (LHOR, LEPH, LDEM), SPICE ephemeris orchestration, and CLI."""

from __future__ import annotations

import json
import struct
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pytest

from lunarpipe import build as build_cli
from lunarpipe.dem import create_synthetic_dem
from lunarpipe.ephemeris import EphemerisData, compute_ephemeris
from lunarpipe.formats import (
    LDEM_HEADER_STRUCT,
    LEPH_HEADER_STRUCT,
    LEPH_SAMPLE_STRUCT,
    LHOR_HEADER_STRUCT,
    LHOR_SITE_META_STRUCT,
    SiteHorizonRecord,
    pack_ldem,
    pack_leph,
    pack_lhor,
)
from lunarpipe.kernels import REQUIRED_KERNELS, ensure_kernels


def test_lhor_serialization_header_sizes_and_quantization() -> None:
    sites = [
        SiteHorizonRecord(
            lat_deg=-89.5,
            lon_deg=45.0,
            observer_height_m=2.0,
            elevations_deg=np.array([-1.234, 0.0, 12.345, 400.0, -400.0], dtype=np.float32),
        ),
        SiteHorizonRecord(
            lat_deg=-88.25,
            lon_deg=-120.0,
            observer_height_m=1.5,
            elevations_deg=np.array([0.5, 1.0, 2.0, 3.0, 4.0], dtype=np.float32),
        ),
    ]

    blob = pack_lhor(sites)
    expected_len = 16 + 2 * (12 + 2 * 5)
    assert len(blob) == expected_len

    magic, version, n_az, n_sites, reserved = LHOR_HEADER_STRUCT.unpack_from(blob, 0)
    assert magic == b"LHOR"
    assert version == 1
    assert n_az == 5
    assert n_sites == 2
    assert reserved == 0

    lat0, lon0, h0 = LHOR_SITE_META_STRUCT.unpack_from(blob, 16)
    assert lat0 == pytest.approx(-89.5)
    assert lon0 == pytest.approx(45.0)
    assert h0 == pytest.approx(2.0)

    q0 = struct.unpack_from("<5h", blob, 16 + 12)
    assert q0 == (-123, 0, 1235, 32767, -32768)


def test_lhor_rejects_mismatched_azimuth_counts() -> None:
    sites = [
        SiteHorizonRecord(-89.0, 0.0, 2.0, np.zeros(4, dtype=np.float32)),
        SiteHorizonRecord(-89.5, 10.0, 2.0, np.zeros(5, dtype=np.float32)),
    ]
    with pytest.raises(ValueError, match="elevations"):
        pack_lhor(sites)


def test_leph_serialization_header_and_records() -> None:
    eph = EphemerisData(
        start_unix_utc=1_830_297_600.0,
        step_seconds=3600.0,
        sun_dirs=np.array([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]], dtype=np.float32),
        earth_dirs=np.array([[0.0, 0.0, 1.0], [-1.0, 0.0, 0.0]], dtype=np.float32),
        earth_distance_km=np.array([384400.0, 385000.5], dtype=np.float32),
    )

    blob = pack_leph(eph)
    assert len(blob) == 32 + 2 * 28

    magic, version, reserved, n_samples, start_unix, step_s, pad = LEPH_HEADER_STRUCT.unpack_from(blob, 0)
    assert magic == b"LEPH"
    assert version == 1
    assert reserved == 0
    assert n_samples == 2
    assert start_unix == pytest.approx(1_830_297_600.0)
    assert step_s == pytest.approx(3600.0)
    assert pad == b"\x00" * 8

    s0 = LEPH_SAMPLE_STRUCT.unpack_from(blob, 32)
    s1 = LEPH_SAMPLE_STRUCT.unpack_from(blob, 32 + 28)
    assert s0 == pytest.approx((1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 384400.0))
    assert s1 == pytest.approx((0.0, 1.0, 0.0, -1.0, 0.0, 0.0, 385000.5))


def test_ldem_serialization_and_flat_edge_case() -> None:
    heights = np.array(
        [
            [-100.0, 0.0, 100.0],
            [50.0, -50.0, 100.0],
        ],
        dtype=np.float32,
    )
    blob = pack_ldem(heights, pixel_size_km=0.625)
    assert len(blob) == 32 + 6 * 2

    magic, version, reserved, width, height, px_km, z_min, z_max, pad = LDEM_HEADER_STRUCT.unpack_from(blob, 0)
    assert magic == b"LDEM"
    assert version == 1
    assert reserved == 0
    assert width == 3
    assert height == 2
    assert px_km == pytest.approx(0.625)
    assert z_min == pytest.approx(-100.0)
    assert z_max == pytest.approx(100.0)
    assert pad == b"\x00" * 8

    vals = struct.unpack_from("<6H", blob, 32)
    assert vals[0] == 0
    assert vals[1] == 32768
    assert vals[2] == 65535

    flat = np.full((4, 4), 250.0, dtype=np.float32)
    flat_blob = pack_ldem(flat, pixel_size_km=1.0)
    assert len(flat_blob) == 32 + 16 * 2
    _, _, _, fw, fh, _, fz_min, fz_max, _ = LDEM_HEADER_STRUCT.unpack_from(flat_blob, 0)
    assert (fw, fh) == (4, 4)
    assert fz_min == pytest.approx(250.0)
    assert fz_max == pytest.approx(250.0)
    assert struct.unpack_from("<16H", flat_blob, 32) == (0,) * 16


def test_ephemeris_requires_real_kernels_and_clears_pool(tmp_path) -> None:
    # Missing kernels must fail rather than returning simulated data.
    with patch("lunarpipe.ephemeris.spiceypy.kclear") as mock_kclear:
        with pytest.raises(FileNotFoundError, match="Missing required SPICE kernel"):
            compute_ephemeris("2028-01-01T00:00:00Z", 1.0, tmp_path, download_kernels=False)
        assert mock_kclear.call_count == 0

    # Create dummy non-empty files so ensure_kernels passes, then simulate a SPICE error mid-run.
    for spec in REQUIRED_KERNELS:
        (tmp_path / spec.filename).write_bytes(b"placeholder")

    with (
        patch("lunarpipe.ephemeris.spiceypy.kclear") as mock_kclear,
        patch("lunarpipe.ephemeris.spiceypy.furnsh") as mock_furnsh,
        patch("lunarpipe.ephemeris.spiceypy.str2et", return_value=0.0),
        patch("lunarpipe.ephemeris.spiceypy.spkpos", side_effect=RuntimeError("SPICE failure")),
    ):
        with pytest.raises(RuntimeError, match="SPICE failure"):
            compute_ephemeris("2028-01-01T00:00:00Z", 0.1, tmp_path, download_kernels=False)
        assert mock_furnsh.call_count == len(REQUIRED_KERNELS)
        assert mock_kclear.call_count == 2  # initial clear + finally clear


def test_ephemeris_uses_moon_me_lt_s_and_normalizes_vectors(tmp_path) -> None:
    for spec in REQUIRED_KERNELS:
        (tmp_path / spec.filename).write_bytes(b"kernel")

    def fake_spkpos(targ: str, et: float, ref: str, abcorr: str, obs: str):
        assert ref == "MOON_ME"
        assert abcorr == "LT+S"
        assert obs == "MOON"
        if targ == "SUN":
            return ([3.0, 4.0, 0.0], 499.0)
        if targ == "EARTH":
            return ([0.0, 384400.0, 0.0], 1.28)
        raise AssertionError(f"Unexpected target: {targ}")

    with (
        patch("lunarpipe.ephemeris.spiceypy.kclear") as mock_kclear,
        patch("lunarpipe.ephemeris.spiceypy.furnsh"),
        patch("lunarpipe.ephemeris.spiceypy.str2et", return_value=100.0),
        patch("lunarpipe.ephemeris.spiceypy.spkpos", side_effect=fake_spkpos),
    ):
        eph = compute_ephemeris("2028-01-01T00:00:00Z", duration_days=1.0, kernel_dir=tmp_path)

    assert mock_kclear.call_count == 2
    assert eph.step_seconds == pytest.approx(3600.0)
    assert eph.sun_dirs.shape == (25, 3)
    assert np.allclose(eph.sun_dirs[0], [0.6, 0.8, 0.0], atol=1e-6)
    assert np.allclose(eph.earth_dirs[0], [0.0, 1.0, 0.0], atol=1e-6)
    assert float(eph.earth_distance_km[0]) == pytest.approx(384400.0)


def test_ensure_kernels_cleans_partial_file_on_download_error(tmp_path) -> None:
    def failing_urlopen(*args, **kwargs):
        raise OSError("network unreachable")

    with patch("lunarpipe.kernels.urllib.request.urlopen", side_effect=failing_urlopen):
        with pytest.raises(RuntimeError, match="Failed to download SPICE kernel"):
            ensure_kernels(tmp_path, download=True)

    assert list(tmp_path.glob("*.part")) == []
    assert list(tmp_path.glob("*.tls")) == []


def test_cli_validation_rejects_empty_and_out_of_bounds_sites(tmp_path) -> None:
    rasterio = pytest.importorskip("rasterio")
    dem = create_synthetic_dem(width=32, height=32, resolution_m=100.0)
    dem_path = tmp_path / "dem.tif"
    with rasterio.open(
        dem_path,
        "w",
        driver="GTiff",
        height=32,
        width=32,
        count=1,
        dtype="float32",
        transform=dem.transform,
    ) as dst:
        dst.write(dem.heights.astype(np.float32), 1)

    empty_sites = tmp_path / "empty.json"
    empty_sites.write_text("[]", encoding="utf-8")
    rc = build_cli.main(
        [
            "--dem",
            str(dem_path),
            "--sites",
            str(empty_sites),
            "--output-dir",
            str(tmp_path / "out"),
            "--kernels-dir",
            str(tmp_path / "kernels"),
            "--no-download-kernels",
        ]
    )
    assert rc != 0

    outside_sites = tmp_path / "outside.json"
    outside_sites.write_text(
        json.dumps([{"id": "far", "lat": -80.0, "lon": 0.0}]),
        encoding="utf-8",
    )
    rc2 = build_cli.main(
        [
            "--dem",
            str(dem_path),
            "--sites",
            str(outside_sites),
            "--output-dir",
            str(tmp_path / "out"),
            "--kernels-dir",
            str(tmp_path / "kernels"),
            "--no-download-kernels",
        ]
    )
    assert rc2 != 0


def test_cli_end_to_end_generates_binary_outputs(tmp_path, capsys) -> None:
    rasterio = pytest.importorskip("rasterio")
    dem = create_synthetic_dem(
        width=64,
        height=64,
        resolution_m=100.0,
        base_elevation_m=5.0,
        ridge_height_m=15.0,
        ridge_distance_m=500.0,
    )
    dem_path = tmp_path / "dem.tif"
    with rasterio.open(
        dem_path,
        "w",
        driver="GTiff",
        height=64,
        width=64,
        count=1,
        dtype="float32",
        transform=dem.transform,
    ) as dst:
        dst.write(dem.heights.astype(np.float32), 1)

    sites_path = tmp_path / "sites.json"
    sites_path.write_text(
        json.dumps([{"id": "south_pole", "lat": -90.0, "lon": 0.0}]),
        encoding="utf-8",
    )

    kernels_dir = tmp_path / "kernels"
    kernels_dir.mkdir()
    for spec in REQUIRED_KERNELS:
        (kernels_dir / spec.filename).write_bytes(b"kernel")

    out_dir = tmp_path / "out" / "nested"

    def fake_spkpos(targ: str, et: float, ref: str, abcorr: str, obs: str):
        if targ == "SUN":
            return ([1.0, 0.0, 0.0], 500.0)
        return ([0.0, 384400.0, 0.0], 1.28)

    with (
        patch("lunarpipe.ephemeris.spiceypy.kclear"),
        patch("lunarpipe.ephemeris.spiceypy.furnsh"),
        patch("lunarpipe.ephemeris.spiceypy.str2et", return_value=0.0),
        patch("lunarpipe.ephemeris.spiceypy.spkpos", side_effect=fake_spkpos),
    ):
        rc = build_cli.main(
            [
                "--dem",
                str(dem_path),
                "--sites",
                str(sites_path),
                "--output-dir",
                str(out_dir),
                "--kernels-dir",
                str(kernels_dir),
                "--start-utc",
                "2028-01-01T00:00:00Z",
                "--duration-days",
                "0.25",
                "--step-seconds",
                "3600",
                "--observer-height",
                "2.0",
                "--terrain-extent-km",
                "6.4",
                "--terrain-size",
                "32",
                "--n-azimuths",
                "36",
                "--no-download-kernels",
            ]
        )

    assert rc == 0
    captured = capsys.readouterr()
    assert "horizons.lhor" in captured.out
    assert "terrain.ldem" in captured.out
    assert "ephemeris.leph" in captured.out

    lhor_bytes = (out_dir / "horizons.lhor").read_bytes()
    ldem_bytes = (out_dir / "terrain.ldem").read_bytes()
    leph_bytes = (out_dir / "ephemeris.leph").read_bytes()

    assert len(lhor_bytes) == 16 + 1 * (12 + 2 * 36)
    assert len(ldem_bytes) == 32 + 32 * 32 * 2
    assert len(leph_bytes) == 32 + 7 * 28

