"""Sun/Earth ephemeris (ephemeris.leph) in the MOON_ME frame."""

from __future__ import annotations

from datetime import datetime

import numpy as np
from fastapi import APIRouter, Depends, Query

from lunarapi import geometry as geo
from lunarapi.analysis import interpolate_ephemeris, iso_utc, select_samples, to_unix
from lunarapi.deps import get_store, to_list
from lunarapi.schemas import EphemerisAt, EphemerisMetadata, EphemerisSamples, TimeWindow
from lunarapi.store import DataStore

router = APIRouter(prefix="/ephemeris", tags=["ephemeris"])


@router.get("", response_model=EphemerisMetadata, summary="Ephemeris coverage metadata")
def ephemeris_metadata(store: DataStore = Depends(get_store)) -> EphemerisMetadata:
    e = store.ephemeris()
    return EphemerisMetadata(
        n_samples=e.n_samples,
        start_utc=iso_utc(e.start_unix_utc),
        end_utc=iso_utc(e.end_unix_utc),
        start_unix=e.start_unix_utc,
        end_unix=e.end_unix_utc,
        step_seconds=e.step_seconds,
    )


@router.get("/samples", response_model=EphemerisSamples, summary="Ephemeris samples in a time window")
def ephemeris_samples(
    start: datetime | None = Query(None, description="ISO-8601 or Unix seconds."),
    end: datetime | None = Query(None, description="ISO-8601 or Unix seconds."),
    stride: int = Query(1, ge=1),
    max_points: int = Query(5000, ge=1),
    store: DataStore = Depends(get_store),
) -> EphemerisSamples:
    e = store.ephemeris()
    sel = select_samples(e, start, end, stride=stride, max_points=min(max_points, store.settings.max_series_points))
    idx = sel.indices
    times = e.start_unix_utc + idx * e.step_seconds
    sun, earth = e.sun_dirs[idx], e.earth_dirs[idx]
    ss_lat, ss_lon = geo.sub_point_latlon(sun)
    se_lat, se_lon = geo.sub_point_latlon(earth)
    return EphemerisSamples(
        window=TimeWindow(
            start_utc=iso_utc(times[0]),
            end_utc=iso_utc(times[-1]),
            step_seconds=e.step_seconds * sel.stride,
            stride=sel.stride,
            n_points=int(idx.size),
            n_samples_in_range=sel.total_in_range,
        ),
        times_unix=to_list(times, 3),
        times_utc=[iso_utc(t) for t in times],
        sun_dir=np.round(sun, 7).tolist(),
        earth_dir=np.round(earth, 7).tolist(),
        earth_distance_km=to_list(e.earth_distance_km[idx], 2),
        subsolar_lat_deg=to_list(ss_lat, 4),
        subsolar_lon_deg=to_list(ss_lon, 4),
        subearth_lat_deg=to_list(se_lat, 4),
        subearth_lon_deg=to_list(se_lon, 4),
    )


@router.get("/at", response_model=EphemerisAt, summary="Ephemeris interpolated at a given time")
def ephemeris_at(
    time: datetime = Query(..., description="ISO-8601 or Unix seconds."),
    store: DataStore = Depends(get_store),
) -> EphemerisAt:
    e = store.ephemeris()
    unix = to_unix(time)
    sun, earth, dist, interpolated = interpolate_ephemeris(e, unix)
    ss_lat, ss_lon = geo.sub_point_latlon(sun)
    se_lat, se_lon = geo.sub_point_latlon(earth)
    return EphemerisAt(
        time_utc=iso_utc(unix),
        time_unix=unix,
        interpolated=interpolated,
        sun_dir=to_list(sun, 7),
        earth_dir=to_list(earth, 7),
        earth_distance_km=round(dist, 2),
        subsolar_lat_deg=float(ss_lat[0]),
        subsolar_lon_deg=float(ss_lon[0]),
        subearth_lat_deg=float(se_lat[0]),
        subearth_lon_deg=float(se_lon[0]),
    )
