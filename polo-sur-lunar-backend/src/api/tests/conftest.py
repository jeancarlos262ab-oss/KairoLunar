from __future__ import annotations

import json
import math
import struct
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from lunarapi.config import Settings
from lunarapi.main import create_app

START_UNIX = 1830297600.0  # 2028-01-01T00:00:00Z
N_AZ = 36
SITES = [
    {"id": "shackleton_rim", "name": "Shackleton Rim", "lat": -89.8, "lon": 0.0, "priority": 1},
    {"id": "connecting_ridge", "lat": -89.45, "lon": 222.5},
]


def pack_lhor(sites: list[tuple[float, float, float, np.ndarray]], n_az: int) -> bytes:
    out = [struct.pack("<4sHHII", b"LHOR", 1, n_az, len(sites), 0)]
    for lat, lon, h, elev in sites:
        out.append(struct.pack("<fff", lat, lon, h))
        out.append(np.clip(np.rint(np.asarray(elev) * 100), -32768, 32767).astype("<i2").tobytes())
    return b"".join(out)


def pack_ldem(heights: np.ndarray, px_km: float) -> bytes:
    z0, z1 = float(heights.min()), float(heights.max())
    h, w = heights.shape
    head = struct.pack("<4sHHHHfff8s", b"LDEM", 1, 0, w, h, px_km, z0, z1, b"\0" * 8)
    if z1 == z0:
        q = np.zeros((h, w), dtype="<u2")
    else:
        q = np.rint((heights - z0) / (z1 - z0) * 65535).astype("<u2")
    return head + q.tobytes()


def pack_leph(start: float, step: float, sun: np.ndarray, earth: np.ndarray, dist: np.ndarray) -> bytes:
    head = struct.pack("<4sHHIdf8s", b"LEPH", 1, 0, sun.shape[0], start, step, b"\0" * 8)
    rec = np.empty((sun.shape[0], 7), dtype="<f4")
    rec[:, 0:3], rec[:, 3:6], rec[:, 6] = sun, earth, dist
    return head + rec.tobytes()


def synthetic_ephemeris(n: int = 25) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Sun circling the horizon at subsolar latitude -1.5 deg; Earth fixed near lon 0."""
    lon = np.radians(np.linspace(0.0, 360.0, n, endpoint=False))
    lat = math.radians(-1.5)
    sun = np.stack([math.cos(lat) * np.cos(lon), math.cos(lat) * np.sin(lon), np.full(n, math.sin(lat))], axis=1)
    elat = math.radians(-3.0)
    earth = np.tile([math.cos(elat), 0.0, math.sin(elat)], (n, 1))
    dist = np.full(n, 384_400.0)
    return sun, earth, dist


@pytest.fixture()
def data_dir(tmp_path: Path) -> Path:
    flat = np.zeros(N_AZ)
    wall = np.full(N_AZ, 10.0)
    (tmp_path / "horizons.lhor").write_bytes(
        pack_lhor([(-89.8, 0.0, 2.0, flat), (-89.45, 222.5, 2.0, wall)], N_AZ)
    )
    yy, xx = np.mgrid[0:64, 0:64]
    hill = 1000.0 * np.exp(-(((yy - 31.5) ** 2 + (xx - 40) ** 2) / 50.0)) - 500.0
    (tmp_path / "terrain.ldem").write_bytes(pack_ldem(hill, 2.5))
    sun, earth, dist = synthetic_ephemeris()
    (tmp_path / "ephemeris.leph").write_bytes(pack_leph(START_UNIX, 3600.0, sun, earth, dist))
    (tmp_path / "sites.json").write_text(json.dumps(SITES), encoding="utf-8")
    return tmp_path


@pytest.fixture()
def client(data_dir: Path) -> TestClient:
    settings = Settings(data_dir=data_dir, sites_path=data_dir / "sites.json")
    return TestClient(create_app(settings))


@pytest.fixture()
def empty_client(tmp_path: Path) -> TestClient:
    return TestClient(create_app(Settings(data_dir=tmp_path / "missing", sites_path=None)))
