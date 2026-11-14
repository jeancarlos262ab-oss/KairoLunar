"""Derived per-site analyses: Sun/Earth topocentric geometry, illumination and visibility."""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timezone

import numpy as np

from lunarapi import geometry as geo
from lunarapi.readers import EphemerisFile
from lunarapi.store import Site


class RangeError(ValueError):
    """Requested time range does not overlap the ephemeris."""


def to_unix(value: datetime | None) -> float | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.timestamp()


def iso_utc(unix: float) -> str:
    return datetime.fromtimestamp(unix, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def interpolate_ephemeris(eph: EphemerisFile, unix: float) -> tuple[np.ndarray, np.ndarray, float, bool]:
    """Linear interpolation (direction vectors re-normalized) at an arbitrary time."""
    if eph.n_samples == 0:
        raise RangeError("Ephemeris contains no samples.")
    pos = (unix - eph.start_unix_utc) / eph.step_seconds
    if pos < -1e-9 or pos > eph.n_samples - 1 + 1e-9:
        raise RangeError(
            f"Time {iso_utc(unix)} outside ephemeris coverage "
            f"[{iso_utc(eph.start_unix_utc)}, {iso_utc(eph.end_unix_utc)}]."
        )
    pos = min(max(pos, 0.0), eph.n_samples - 1)
    i0 = min(int(np.floor(pos)), max(0, eph.n_samples - 2))
    i1 = min(i0 + 1, eph.n_samples - 1)
    t = pos - i0
    sun = (1 - t) * eph.sun_dirs[i0] + t * eph.sun_dirs[i1]
    earth = (1 - t) * eph.earth_dirs[i0] + t * eph.earth_dirs[i1]
    dist = float((1 - t) * eph.earth_distance_km[i0] + t * eph.earth_distance_km[i1])
    return sun / np.linalg.norm(sun), earth / np.linalg.norm(earth), dist, bool(1e-9 < t < 1 - 1e-9)


@dataclass(frozen=True)
class SampleSelection:
    indices: np.ndarray
    stride: int
    total_in_range: int


def select_samples(
    eph: EphemerisFile,
    start: datetime | None,
    end: datetime | None,
    stride: int = 1,
    max_points: int | None = None,
) -> SampleSelection:
    """Indices of ephemeris samples within ``[start, end]``; auto-increase stride over ``max_points``."""
    if eph.n_samples == 0:
        raise RangeError("Ephemeris contains no samples.")
    t0, dt = eph.start_unix_utc, eph.step_seconds
    s, e = to_unix(start), to_unix(end)
    i_start = 0 if s is None else max(0, math.ceil((s - t0) / dt - 1e-9))
    i_end = eph.n_samples - 1 if e is None else min(eph.n_samples - 1, math.floor((e - t0) / dt + 1e-9))
    if i_end < i_start:
        raise RangeError(
            f"Requested range does not overlap ephemeris coverage "
            f"[{iso_utc(t0)}, {iso_utc(eph.end_unix_utc)}]."
        )
    total = i_end - i_start + 1
    stride = max(1, int(stride))
    if max_points is not None and max_points > 0 and math.ceil(total / stride) > max_points:
        stride = math.ceil(total / max_points)
    return SampleSelection(np.arange(i_start, i_end + 1, stride, dtype=np.int64), stride, total)


@dataclass(frozen=True)
class SiteGeometry:
    times_unix: np.ndarray
    sun_az: np.ndarray
    sun_el: np.ndarray
    sun_horizon: np.ndarray
    sun_fraction: np.ndarray
    earth_az: np.ndarray
    earth_el: np.ndarray
    earth_horizon: np.ndarray
    earth_visible: np.ndarray
    earth_distance_km: np.ndarray


def site_geometry(site: Site, eph: EphemerisFile, indices: np.ndarray, solar_radius_deg: float) -> SiteGeometry:
    """Sun/Earth azimuth/elevation at the site (true north), horizon masking and disk fraction."""
    sun_az, sun_el = geo.topocentric_az_el(eph.sun_dirs[indices], site.lat_deg, site.lon_deg)

    # Earth parallax from the lunar surface is ~1 deg -> use site-relative vectors.
    dist = eph.earth_distance_km[indices]
    earth_vecs = eph.earth_dirs[indices] * dist[:, None] - geo.site_position_km(site.lat_deg, site.lon_deg)
    earth_az, earth_el = geo.topocentric_az_el(earth_vecs, site.lat_deg, site.lon_deg)

    mask = site.horizon_grid_deg
    sun_h = geo.interpolate_horizon(mask, sun_az + site.lon_deg)
    earth_h = geo.interpolate_horizon(mask, earth_az + site.lon_deg)

    return SiteGeometry(
        times_unix=eph.start_unix_utc + indices.astype(np.float64) * eph.step_seconds,
        sun_az=sun_az,
        sun_el=sun_el,
        sun_horizon=sun_h,
        sun_fraction=geo.solar_disk_fraction(sun_el, sun_h, solar_radius_deg),
        earth_az=earth_az,
        earth_el=earth_el,
        earth_horizon=earth_h,
        earth_visible=earth_el > earth_h,
        earth_distance_km=dist,
    )


def site_statistics(g: SiteGeometry, step_seconds: float) -> dict[str, float | int]:
    n = int(g.times_unix.size)
    lit = g.sun_fraction > 0.0
    return {
        "n_samples": n,
        "mean_solar_disk_fraction": float(g.sun_fraction.mean()) if n else 0.0,
        "sun_any_visible_pct": float(lit.mean() * 100.0) if n else 0.0,
        "sun_fully_visible_pct": float((g.sun_fraction >= 1.0).mean() * 100.0) if n else 0.0,
        "earth_visible_pct": float(g.earth_visible.mean() * 100.0) if n else 0.0,
        "sun_and_earth_visible_pct": float((lit & g.earth_visible).mean() * 100.0) if n else 0.0,
        "longest_darkness_hours": geo.longest_run_seconds(~lit, step_seconds) / 3600.0,
        "longest_earth_blackout_hours": geo.longest_run_seconds(~g.earth_visible, step_seconds) / 3600.0,
        "max_sun_elevation_deg": float(g.sun_el.max()) if n else float("nan"),
        "min_sun_elevation_deg": float(g.sun_el.min()) if n else float("nan"),
    }


def visibility_state(sun_fraction: float, earth_visible: bool) -> str:
    """Classify combined Sun illumination and Earth link state."""
    sunlit = sun_fraction > 0.0
    if sunlit and earth_visible:
        return "sunlit_and_earth_link"
    if sunlit:
        return "sunlit_no_link"
    if earth_visible:
        return "dark_with_earth_link"
    return "dark_no_link"


def _first_transition(
    times_unix: np.ndarray,
    series: np.ndarray,
    current: bool,
    at_unix: float,
    rise_label: str,
    set_label: str,
) -> dict | None:
    diff = np.flatnonzero(series != current)
    if diff.size == 0:
        return None
    idx = int(diff[0])
    t_ev = float(times_unix[idx])
    return {
        "type": rise_label if bool(series[idx]) else set_label,
        "time_utc": iso_utc(t_ev),
        "time_unix": t_ev,
        "in_hours": round((t_ev - at_unix) / 3600.0, 6),
    }


def next_visibility_events(
    site: Site,
    eph: EphemerisFile,
    at_unix: float,
    solar_radius_deg: float,
) -> tuple[dict | None, dict | None]:
    """Find the next Sun and Earth rise/set transitions from ``at_unix`` onward."""
    sun_dir, earth_dir, dist, _ = interpolate_ephemeris(eph, at_unix)
    sun_az, sun_el = geo.topocentric_az_el(sun_dir, site.lat_deg, site.lon_deg)
    earth_vec = earth_dir * dist - geo.site_position_km(site.lat_deg, site.lon_deg)
    earth_az, earth_el = geo.topocentric_az_el(earth_vec, site.lat_deg, site.lon_deg)

    mask = site.horizon_grid_deg
    sun_h = float(geo.interpolate_horizon(mask, sun_az[0] + site.lon_deg))
    earth_h = float(geo.interpolate_horizon(mask, earth_az[0] + site.lon_deg))
    sun_now = bool(float(geo.solar_disk_fraction(sun_el[0], sun_h, solar_radius_deg)) > 0.0)
    earth_now = bool(float(earth_el[0]) > earth_h)

    pos = (at_unix - eph.start_unix_utc) / eph.step_seconds
    i_start = max(1, int(math.floor(pos + 1e-9)) + 1)
    if i_start >= eph.n_samples:
        return None, None

    indices = np.arange(i_start, eph.n_samples, dtype=np.int64)
    g = site_geometry(site, eph, indices, solar_radius_deg)
    sun_event = _first_transition(g.times_unix, g.sun_fraction > 0.0, sun_now, at_unix, "sunrise", "sunset")
    earth_event = _first_transition(g.times_unix, g.earth_visible, earth_now, at_unix, "earthrise", "earthset")
    return sun_event, earth_event


def evaluate_sky_position(
    eph: EphemerisFile,
    at_unix: float,
    lat_deg: float,
    lon_deg: float,
    solar_radius_deg: float,
    site: Site | None = None,
) -> dict:
    """Evaluate Sun/Earth topocentric coordinates (and horizon/events if ``site`` is given)."""
    sun_dir, earth_dir, dist, _ = interpolate_ephemeris(eph, at_unix)
    if site is not None:
        lat_deg, lon_deg = site.lat_deg, site.lon_deg

    sun_az, sun_el = geo.topocentric_az_el(sun_dir, lat_deg, lon_deg)
    earth_vec = earth_dir * dist - geo.site_position_km(lat_deg, lon_deg)
    earth_az, earth_el = geo.topocentric_az_el(earth_vec, lat_deg, lon_deg)

    sun: dict[str, float | bool | None] = {"azimuth_deg": float(sun_az[0]), "elevation_deg": float(sun_el[0])}
    earth: dict[str, float | bool | None] = {"azimuth_deg": float(earth_az[0]), "elevation_deg": float(earth_el[0])}
    fraction: float | None = None
    state: str | None = None
    next_sun: dict | None = None
    next_earth: dict | None = None

    if site is not None:
        mask = site.horizon_grid_deg
        sh = float(geo.interpolate_horizon(mask, sun_az[0] + lon_deg))
        eh = float(geo.interpolate_horizon(mask, earth_az[0] + lon_deg))
        fraction = float(geo.solar_disk_fraction(float(sun_el[0]), sh, solar_radius_deg))
        sun_vis = fraction > 0.0
        earth_vis = float(earth_el[0]) > eh
        sun["horizon_elevation_deg"], sun["visible"] = sh, sun_vis
        earth["horizon_elevation_deg"], earth["visible"] = eh, earth_vis
        state = visibility_state(fraction, earth_vis)
        next_sun, next_earth = next_visibility_events(site, eph, at_unix, solar_radius_deg)

    return {
        "time_utc": iso_utc(at_unix),
        "lat_deg": lat_deg,
        "lon_deg": lon_deg,
        "site_id": site.id if site is not None else None,
        "sun": sun,
        "sun_visible_disk_fraction": fraction,
        "earth": earth,
        "earth_distance_km": round(dist, 2),
        "state": state,
        "next_sun_event": next_sun,
        "next_earth_event": next_earth,
    }
