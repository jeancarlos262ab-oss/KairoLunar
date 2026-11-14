"""SPICE-based solar and terrestrial ephemeris computation in the MOON_ME frame."""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import spiceypy

from lunarpipe.kernels import ensure_kernels


@dataclass(frozen=True)
class EphemerisData:
    """Time series of Moon->Sun and Moon->Earth unit vectors in ``MOON_ME``.

    Attributes:
        start_unix_utc: Start timestamp in Unix UTC seconds.
        step_seconds: Uniform sampling interval in seconds.
        sun_dirs: ``(N, 3)`` ``float32`` unit vectors from Moon to Sun in ``MOON_ME``.
        earth_dirs: ``(N, 3)`` ``float32`` unit vectors from Moon to Earth in ``MOON_ME``.
        earth_distance_km: ``(N,)`` ``float32`` Earth-Moon distances in kilometers.
    """

    start_unix_utc: float
    step_seconds: float
    sun_dirs: np.ndarray
    earth_dirs: np.ndarray
    earth_distance_km: np.ndarray


def parse_utc_datetime(value: str | datetime) -> datetime:
    """Parse an ISO-8601 UTC date/time string or :class:`datetime` into an aware UTC datetime."""
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        text = value.strip()
        if not text:
            raise ValueError("UTC timestamp string cannot be empty.")
        if text.endswith("Z") or text.endswith("z"):
            text = text[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(text)
        except ValueError as exc:
            raise ValueError(f"Invalid UTC ISO-8601 timestamp: {value!r}") from exc
    else:
        raise TypeError(f"Expected str or datetime for UTC timestamp, got {type(value).__name__}.")

    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def compute_ephemeris(
    start_utc: str | datetime,
    duration_days: float,
    kernel_dir: str | Path,
    step_seconds: float = 3600.0,
    download_kernels: bool = False,
) -> EphemerisData:
    """Compute Moon->Sun and Moon->Earth directions in ``MOON_ME`` using NAIF SPICE.

    Uses aberration correction ``LT+S`` with observer ``MOON``. Never fabricates or
    simulates data when kernels are absent or SPICE computation fails, and always clears
    the SPICE kernel pool on exit.

    Args:
        start_utc: Initial UTC epoch (ISO-8601 string or :class:`datetime`).
        duration_days: Span of the ephemeris in days (must be ``> 0``).
        kernel_dir: Directory containing the required NAIF SPICE kernels.
        step_seconds: Time step between samples in seconds (default ``3600.0``).
        download_kernels: Whether to download missing kernels via :func:`ensure_kernels`.

    Returns:
        :class:`EphemerisData` containing unit directions and Earth-Moon distance (km).

    Raises:
        FileNotFoundError: If required kernels are missing and ``download_kernels=False``.
        RuntimeError: If SPICE fails to load kernels or evaluate positions.
        ValueError: If time parameters are invalid or SPICE produces invalid vectors.
    """
    if not math.isfinite(duration_days) or duration_days <= 0.0:
        raise ValueError(f"duration_days must be finite and > 0, got {duration_days}.")
    if not math.isfinite(step_seconds) or step_seconds <= 0.0:
        raise ValueError(f"step_seconds must be finite and > 0, got {step_seconds}.")

    start_dt = parse_utc_datetime(start_utc)
    start_unix_utc = float(start_dt.timestamp())

    total_seconds = float(duration_days) * 86400.0
    n_samples = max(1, int(math.floor(total_seconds / float(step_seconds) + 1e-9)) + 1)

    kernel_paths = ensure_kernels(kernel_dir, download=download_kernels)

    sun_dirs = np.empty((n_samples, 3), dtype=np.float32)
    earth_dirs = np.empty((n_samples, 3), dtype=np.float32)
    earth_distance_km = np.empty(n_samples, dtype=np.float32)

    spiceypy.kclear()
    try:
        for kpath in kernel_paths:
            if not kpath.is_file() or kpath.stat().st_size == 0:
                raise FileNotFoundError(f"Required SPICE kernel missing or empty: {kpath}")
            spiceypy.furnsh(str(kpath))

        for i in range(n_samples):
            dt_i = start_dt + timedelta(seconds=float(i) * float(step_seconds))
            utc_str = dt_i.strftime("%Y-%m-%dT%H:%M:%S.%f UTC")
            et = float(spiceypy.str2et(utc_str))

            sun_pos, _ = spiceypy.spkpos("SUN", et, "MOON_ME", "LT+S", "MOON")
            earth_pos, _ = spiceypy.spkpos("EARTH", et, "MOON_ME", "LT+S", "MOON")

            sun_vec = np.asarray(sun_pos, dtype=np.float64)
            earth_vec = np.asarray(earth_pos, dtype=np.float64)

            sun_norm = float(np.linalg.norm(sun_vec))
            earth_norm = float(np.linalg.norm(earth_vec))
            if not math.isfinite(sun_norm) or sun_norm <= 0.0:
                raise ValueError(f"Invalid Moon->Sun vector norm at sample {i}: {sun_norm}")
            if not math.isfinite(earth_norm) or earth_norm <= 0.0:
                raise ValueError(f"Invalid Moon->Earth vector norm at sample {i}: {earth_norm}")

            sun_dirs[i] = (sun_vec / sun_norm).astype(np.float32)
            earth_dirs[i] = (earth_vec / earth_norm).astype(np.float32)
            earth_distance_km[i] = np.float32(earth_norm)
    except Exception as exc:
        if isinstance(exc, (FileNotFoundError, ValueError)):
            raise
        raise RuntimeError(f"SPICE ephemeris computation failed: {exc}") from exc
    finally:
        spiceypy.kclear()

    return EphemerisData(
        start_unix_utc=start_unix_utc,
        step_seconds=float(step_seconds),
        sun_dirs=sun_dirs,
        earth_dirs=earth_dirs,
        earth_distance_km=earth_distance_km,
    )
