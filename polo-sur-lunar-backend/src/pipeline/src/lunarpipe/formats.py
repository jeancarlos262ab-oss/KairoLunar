"""Explicit little-endian v1 binary serializers for LHOR, LEPH, and LDEM files."""

from __future__ import annotations

import math
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import numpy as np

from lunarpipe.ephemeris import EphemerisData

# Explicit fixed-size little-endian structs (no native struct alignment).
LHOR_HEADER_STRUCT = struct.Struct("<4sHHII")  # 16 bytes
LHOR_SITE_META_STRUCT = struct.Struct("<fff")  # 12 bytes
LEPH_HEADER_STRUCT = struct.Struct("<4sHHIdf8s")  # 32 bytes (8 bytes trailing zero padding)
LEPH_SAMPLE_STRUCT = struct.Struct("<7f")  # 28 bytes
LDEM_HEADER_STRUCT = struct.Struct("<4sHHHHfff8s")  # 32 bytes (8 bytes trailing zero padding)

FORMAT_VERSION = 1
_INT16_MIN = -32768
_INT16_MAX = 32767


@dataclass(frozen=True)
class SiteHorizonRecord:
    """Horizon mask record for a single site prior to binary serialization."""

    lat_deg: float
    lon_deg: float
    observer_height_m: float
    elevations_deg: np.ndarray


def _write_bytes_atomic(path: str | Path, payload: bytes) -> Path:
    dest = Path(path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.name + ".tmp")
    try:
        tmp.write_bytes(payload)
        tmp.replace(dest)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise
    return dest


def pack_lhor(
    sites: Sequence[SiteHorizonRecord],
    n_azimuths: int | None = None,
) -> bytes:
    """Serialize horizon masks to the LHOR v1 little-endian binary format.

    Header (16 bytes): ``LHOR`` (4B), version ``1`` (u16), ``n_azimuths`` (u16),
    ``n_sites`` (u32), reserved ``0`` (u32).

    Each site record: ``lat_deg`` (f32), ``lon_deg`` (f32), ``observer_height_m`` (f32),
    followed by ``n_azimuths`` signed ``int16`` values in centidegrees
    (``round(deg * 100)``, saturated to ``[-32768, 32767]``).
    """
    n_sites = len(sites)
    if n_sites > 0xFFFFFFFF:
        raise ValueError(f"Number of sites exceeds uint32 range: {n_sites}.")

    if n_azimuths is None:
        if n_sites == 0:
            raise ValueError("n_azimuths must be provided when packing an empty site list.")
        first_elev = np.asarray(sites[0].elevations_deg)
        if first_elev.ndim != 1:
            raise ValueError(f"Site elevations must be 1D, got shape {first_elev.shape}.")
        resolved_az = int(first_elev.shape[0])
    else:
        if isinstance(n_azimuths, bool) or not isinstance(n_azimuths, (int, np.integer)):
            raise ValueError(f"n_azimuths must be an integer, got {n_azimuths!r}.")
        resolved_az = int(n_azimuths)

    if resolved_az < 1 or resolved_az > 65535:
        raise ValueError(f"n_azimuths must be in [1, 65535], got {resolved_az}.")

    chunks: list[bytes] = [
        LHOR_HEADER_STRUCT.pack(b"LHOR", FORMAT_VERSION, resolved_az, n_sites, 0)
    ]

    for idx, site in enumerate(sites):
        if not (
            math.isfinite(site.lat_deg)
            and math.isfinite(site.lon_deg)
            and math.isfinite(site.observer_height_m)
        ):
            raise ValueError(f"Site {idx} metadata contains non-finite values.")

        elev = np.asarray(site.elevations_deg, dtype=np.float64)
        if elev.ndim != 1 or elev.shape[0] != resolved_az:
            raise ValueError(
                f"Site {idx} has {elev.shape} elevations, expected ({resolved_az},)."
            )
        if not np.all(np.isfinite(elev)):
            raise ValueError(f"Site {idx} contains non-finite horizon elevation values.")

        centideg = np.rint(elev * 100.0)
        quantized = np.clip(centideg, _INT16_MIN, _INT16_MAX).astype("<i2")

        chunks.append(
            LHOR_SITE_META_STRUCT.pack(
                float(site.lat_deg),
                float(site.lon_deg),
                float(site.observer_height_m),
            )
        )
        chunks.append(quantized.tobytes())

    return b"".join(chunks)


def write_lhor(
    path: str | Path,
    sites: Sequence[SiteHorizonRecord],
    n_azimuths: int | None = None,
) -> Path:
    """Write LHOR v1 binary data to ``path``."""
    return _write_bytes_atomic(path, pack_lhor(sites, n_azimuths=n_azimuths))


def pack_leph(ephemeris: EphemerisData) -> bytes:
    """Serialize :class:`EphemerisData` to the LEPH v1 little-endian binary format."""
    return pack_leph_arrays(
        start_unix_utc=ephemeris.start_unix_utc,
        step_seconds=ephemeris.step_seconds,
        sun_dirs=ephemeris.sun_dirs,
        earth_dirs=ephemeris.earth_dirs,
        earth_distance_km=ephemeris.earth_distance_km,
    )


def pack_leph_arrays(
    start_unix_utc: float,
    step_seconds: float,
    sun_dirs: np.ndarray,
    earth_dirs: np.ndarray,
    earth_distance_km: np.ndarray,
) -> bytes:
    """Serialize ephemeris arrays to the LEPH v1 little-endian binary format.

    Header (32 bytes): ``LEPH`` (4B), version ``1`` (u16), reserved ``0`` (u16),
    ``n_samples`` (u32), ``start_unix_utc`` (f64), ``step_seconds`` (f32),
    8 bytes zero padding.

    Each sample record (28 bytes): 3 ``f32`` Moon->Sun unit vector, 3 ``f32``
    Moon->Earth unit vector, 1 ``f32`` Earth-Moon distance in km.
    """
    if not math.isfinite(start_unix_utc):
        raise ValueError(f"start_unix_utc must be finite, got {start_unix_utc}.")
    if not math.isfinite(step_seconds) or step_seconds <= 0.0:
        raise ValueError(f"step_seconds must be finite and > 0, got {step_seconds}.")

    sun = np.asarray(sun_dirs, dtype=np.float64)
    earth = np.asarray(earth_dirs, dtype=np.float64)
    dist = np.asarray(earth_distance_km, dtype=np.float64)

    if sun.ndim != 2 or sun.shape[1] != 3:
        raise ValueError(f"sun_dirs must have shape (N, 3), got {sun.shape}.")
    n_samples = int(sun.shape[0])
    if earth.shape != (n_samples, 3):
        raise ValueError(f"earth_dirs must have shape ({n_samples}, 3), got {earth.shape}.")
    if dist.shape != (n_samples,):
        raise ValueError(f"earth_distance_km must have shape ({n_samples},), got {dist.shape}.")
    if n_samples > 0xFFFFFFFF:
        raise ValueError(f"n_samples exceeds uint32 range: {n_samples}.")

    if not (np.all(np.isfinite(sun)) and np.all(np.isfinite(earth)) and np.all(np.isfinite(dist))):
        raise ValueError("Ephemeris arrays contain non-finite values.")

    header = LEPH_HEADER_STRUCT.pack(
        b"LEPH",
        FORMAT_VERSION,
        0,
        n_samples,
        float(start_unix_utc),
        float(step_seconds),
        b"\x00" * 8,
    )

    if n_samples == 0:
        return header

    records = np.empty((n_samples, 7), dtype="<f4")
    records[:, 0:3] = sun.astype("<f4")
    records[:, 3:6] = earth.astype("<f4")
    records[:, 6] = dist.astype("<f4")
    return header + records.tobytes(order="C")


def write_leph(path: str | Path, ephemeris: EphemerisData) -> Path:
    """Write LEPH v1 binary data to ``path``."""
    return _write_bytes_atomic(path, pack_leph(ephemeris))


def pack_ldem(heights_m: np.ndarray, pixel_size_km: float) -> bytes:
    """Serialize a 2D downsampled elevation grid to the LDEM v1 little-endian binary format.

    Header (32 bytes): ``LDEM`` (4B), version ``1`` (u16), reserved ``0`` (u16),
    ``width`` (u16), ``height`` (u16), ``pixel_size_km`` (f32), ``z_min`` (f32),
    ``z_max`` (f32), 8 bytes zero padding.

    Payload: ``width * height`` ``uint16`` little-endian elevations in row-major order
    (row 0 is north), normalized onto ``[z_min, z_max]``. If all elevations are equal
    (``z_max == z_min``), all quantized values are ``0``.
    """
    arr = np.asarray(heights_m, dtype=np.float64)
    if arr.ndim != 2:
        raise ValueError(f"heights_m must be 2D, got shape {arr.shape}.")
    height, width = arr.shape
    if height < 1 or width < 1 or height > 65535 or width > 65535:
        raise ValueError(
            f"LDEM dimensions must be within [1, 65535], got width={width}, height={height}."
        )
    if not math.isfinite(pixel_size_km) or pixel_size_km <= 0.0:
        raise ValueError(f"pixel_size_km must be finite and > 0, got {pixel_size_km}.")
    if not np.all(np.isfinite(arr)):
        raise ValueError("heights_m contains non-finite values.")

    z_min = float(np.min(arr))
    z_max = float(np.max(arr))
    z_min_f32 = float(np.float32(z_min))
    z_max_f32 = float(np.float32(z_max))

    header = LDEM_HEADER_STRUCT.pack(
        b"LDEM",
        FORMAT_VERSION,
        0,
        width,
        height,
        float(pixel_size_km),
        z_min_f32,
        z_max_f32,
        b"\x00" * 8,
    )

    span = z_max - z_min
    if span == 0.0:
        quantized = np.zeros((height, width), dtype="<u2")
    else:
        norm = (arr - z_min) / span
        quantized = np.clip(np.rint(norm * 65535.0), 0.0, 65535.0).astype("<u2")

    return header + quantized.tobytes(order="C")


def write_ldem(path: str | Path, heights_m: np.ndarray, pixel_size_km: float) -> Path:
    """Write LDEM v1 binary data to ``path``."""
    return _write_bytes_atomic(path, pack_ldem(heights_m, pixel_size_km))
