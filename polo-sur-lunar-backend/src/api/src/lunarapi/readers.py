"""Parsers for the LHOR / LDEM / LEPH v1 little-endian binary files written by ``lunarpipe``.

These readers are the exact inverse of ``lunarpipe.formats`` and intentionally do not import
``lunarpipe`` so that the API can run without the heavy pipeline dependencies (rasterio, SPICE).
"""

from __future__ import annotations

import math
import struct
from dataclasses import dataclass
from pathlib import Path

import numpy as np

LHOR_HEADER_STRUCT = struct.Struct("<4sHHII")  # 16 bytes
LHOR_SITE_META_STRUCT = struct.Struct("<fff")  # 12 bytes
LEPH_HEADER_STRUCT = struct.Struct("<4sHHIdf8s")  # 32 bytes
LEPH_SAMPLE_SIZE = 28  # 7 x f32
LDEM_HEADER_STRUCT = struct.Struct("<4sHHHHfff8s")  # 32 bytes

SUPPORTED_VERSION = 1


class BinaryFormatError(ValueError):
    """Raised when a binary file does not match the expected v1 layout."""


@dataclass(frozen=True)
class HorizonSite:
    """A single site record from ``horizons.lhor``."""

    index: int
    lat_deg: float
    lon_deg: float
    observer_height_m: float
    elevations_deg: np.ndarray  # (n_azimuths,) float64, grid-north referenced


@dataclass(frozen=True)
class HorizonsFile:
    version: int
    n_azimuths: int
    sites: list[HorizonSite]

    @property
    def azimuths_deg(self) -> np.ndarray:
        """Grid azimuths (clockwise from grid north) for each mask sample."""
        return np.arange(self.n_azimuths, dtype=np.float64) * (360.0 / self.n_azimuths)


@dataclass(frozen=True)
class TerrainFile:
    version: int
    width: int
    height: int
    pixel_size_km: float
    z_min_m: float
    z_max_m: float
    raw: np.ndarray  # (height, width) uint16, row 0 = north

    @property
    def heights_m(self) -> np.ndarray:
        """De-quantized elevations in meters as ``float32`` ``(height, width)``."""
        span = self.z_max_m - self.z_min_m
        if span == 0.0:
            return np.full(self.raw.shape, self.z_min_m, dtype=np.float32)
        return (self.z_min_m + self.raw.astype(np.float64) * (span / 65535.0)).astype(np.float32)

    @property
    def quantization_step_m(self) -> float:
        return (self.z_max_m - self.z_min_m) / 65535.0


@dataclass(frozen=True)
class EphemerisFile:
    version: int
    n_samples: int
    start_unix_utc: float
    step_seconds: float
    sun_dirs: np.ndarray  # (N, 3) float64
    earth_dirs: np.ndarray  # (N, 3) float64
    earth_distance_km: np.ndarray  # (N,) float64

    @property
    def end_unix_utc(self) -> float:
        return self.start_unix_utc + max(0, self.n_samples - 1) * self.step_seconds

    @property
    def times_unix(self) -> np.ndarray:
        return self.start_unix_utc + np.arange(self.n_samples, dtype=np.float64) * self.step_seconds


def _check_magic(name: str, magic: bytes, expected: bytes, version: int) -> None:
    if magic != expected:
        raise BinaryFormatError(f"{name}: invalid magic {magic!r}, expected {expected!r}.")
    if version != SUPPORTED_VERSION:
        raise BinaryFormatError(
            f"{name}: unsupported version {version}, expected {SUPPORTED_VERSION}."
        )


def parse_lhor(data: bytes) -> HorizonsFile:
    if len(data) < LHOR_HEADER_STRUCT.size:
        raise BinaryFormatError("LHOR: file shorter than 16-byte header.")
    magic, version, n_az, n_sites, _reserved = LHOR_HEADER_STRUCT.unpack_from(data, 0)
    _check_magic("LHOR", magic, b"LHOR", version)
    if n_az < 1:
        raise BinaryFormatError("LHOR: n_azimuths must be >= 1.")

    record_size = LHOR_SITE_META_STRUCT.size + 2 * n_az
    expected = LHOR_HEADER_STRUCT.size + n_sites * record_size
    if len(data) != expected:
        raise BinaryFormatError(f"LHOR: expected {expected} bytes, got {len(data)}.")

    sites: list[HorizonSite] = []
    offset = LHOR_HEADER_STRUCT.size
    for idx in range(n_sites):
        lat, lon, h = LHOR_SITE_META_STRUCT.unpack_from(data, offset)
        if not (math.isfinite(lat) and math.isfinite(lon) and math.isfinite(h)):
            raise BinaryFormatError(f"LHOR: site {idx} metadata contains non-finite values.")
        offset += LHOR_SITE_META_STRUCT.size
        centideg = np.frombuffer(data, dtype="<i2", count=n_az, offset=offset)
        offset += 2 * n_az
        sites.append(
            HorizonSite(
                index=idx,
                lat_deg=float(lat),
                lon_deg=float(lon),
                observer_height_m=float(h),
                elevations_deg=centideg.astype(np.float64) / 100.0,
            )
        )
    return HorizonsFile(version=version, n_azimuths=n_az, sites=sites)


def parse_ldem(data: bytes) -> TerrainFile:
    if len(data) < LDEM_HEADER_STRUCT.size:
        raise BinaryFormatError("LDEM: file shorter than 32-byte header.")
    magic, version, _res, width, height, px_km, z_min, z_max, _pad = LDEM_HEADER_STRUCT.unpack_from(
        data, 0
    )
    _check_magic("LDEM", magic, b"LDEM", version)
    if not (
        math.isfinite(px_km)
        and px_km > 0.0
        and math.isfinite(z_min)
        and math.isfinite(z_max)
        and z_max >= z_min
    ):
        raise BinaryFormatError(
            f"LDEM: invalid header parameters (pixel_size_km={px_km}, z_min={z_min}, z_max={z_max})."
        )
    expected = LDEM_HEADER_STRUCT.size + 2 * width * height
    if width < 1 or height < 1 or len(data) != expected:
        raise BinaryFormatError(
            f"LDEM: expected {expected} bytes for {width}x{height}, got {len(data)}."
        )
    raw = np.frombuffer(data, dtype="<u2", count=width * height, offset=LDEM_HEADER_STRUCT.size)
    return TerrainFile(
        version=version,
        width=int(width),
        height=int(height),
        pixel_size_km=float(px_km),
        z_min_m=float(z_min),
        z_max_m=float(z_max),
        raw=raw.reshape(height, width).astype(np.uint16),
    )


def parse_leph(data: bytes) -> EphemerisFile:
    if len(data) < LEPH_HEADER_STRUCT.size:
        raise BinaryFormatError("LEPH: file shorter than 32-byte header.")
    magic, version, _res, n_samples, start, step, _pad = LEPH_HEADER_STRUCT.unpack_from(data, 0)
    _check_magic("LEPH", magic, b"LEPH", version)
    expected = LEPH_HEADER_STRUCT.size + n_samples * LEPH_SAMPLE_SIZE
    if len(data) != expected:
        raise BinaryFormatError(f"LEPH: expected {expected} bytes, got {len(data)}.")
    if not (math.isfinite(start) and math.isfinite(step) and step > 0.0):
        raise BinaryFormatError(f"LEPH: invalid timing header (start={start}, step_seconds={step}).")
    records = np.frombuffer(
        data, dtype="<f4", count=n_samples * 7, offset=LEPH_HEADER_STRUCT.size
    ).reshape(n_samples, 7).astype(np.float64)
    if not np.all(np.isfinite(records)):
        raise BinaryFormatError("LEPH: ephemeris records contain non-finite values.")
    return EphemerisFile(
        version=version,
        n_samples=int(n_samples),
        start_unix_utc=float(start),
        step_seconds=float(step),
        sun_dirs=records[:, 0:3].copy(),
        earth_dirs=records[:, 3:6].copy(),
        earth_distance_km=records[:, 6].copy(),
    )


def read_lhor(path: str | Path) -> HorizonsFile:
    return parse_lhor(Path(path).read_bytes())


def read_ldem(path: str | Path) -> TerrainFile:
    return parse_ldem(Path(path).read_bytes())


def read_leph(path: str | Path) -> EphemerisFile:
    return parse_leph(Path(path).read_bytes())
