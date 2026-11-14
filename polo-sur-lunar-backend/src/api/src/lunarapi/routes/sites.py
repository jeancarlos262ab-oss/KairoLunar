"""Site catalog, horizon masks and per-site illumination / Earth-visibility analyses."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

import numpy as np
from fastapi import APIRouter, Depends, Query

from lunarapi import geometry as geo
from lunarapi.analysis import evaluate_sky_position, iso_utc, select_samples, site_geometry, site_statistics, to_unix
from lunarapi.deps import get_store, require_site, terrain_pixel, to_list
from lunarapi.schemas import (
    EarthSeries,
    HorizonResponse,
    HorizonStats,
    IlluminationResponse,
    SiteDetail,
    SitesStatisticsResponse,
    SiteStatistics,
    SiteStatisticsEntry,
    SiteSummary,
    SkyPositionResponse,
    SunSeries,
    TerrainPixel,
    TimeWindow,
)
from lunarapi.store import DataStore, Site

router = APIRouter(prefix="/sites", tags=["sites"])

StartQ = Query(None, description="Start time (ISO-8601 or Unix seconds). Defaults to ephemeris start.")
EndQ = Query(None, description="End time (ISO-8601 or Unix seconds). Defaults to ephemeris end.")
SortKey = Literal[
    "mean_solar_disk_fraction",
    "sun_any_visible_pct",
    "earth_visible_pct",
    "sun_and_earth_visible_pct",
    "longest_darkness_hours",
]


def _summary(site: Site) -> dict:
    x, y = geo.latlon_to_xy(site.lat_deg, site.lon_deg)
    m = site.horizon_grid_deg
    return {
        "id": site.id,
        "index": site.index,
        "name": site.name,
        "lat_deg": site.lat_deg,
        "lon_deg": site.lon_deg,
        "observer_height_m": site.observer_height_m,
        "x_m": x,
        "y_m": y,
        "horizon": HorizonStats(min_deg=float(m.min()), max_deg=float(m.max()), mean_deg=float(m.mean())),
        "metadata": site.metadata,
    }


def _window(eph, sel) -> TimeWindow:
    idx = sel.indices
    return TimeWindow(
        start_utc=iso_utc(eph.start_unix_utc + idx[0] * eph.step_seconds),
        end_utc=iso_utc(eph.start_unix_utc + idx[-1] * eph.step_seconds),
        step_seconds=eph.step_seconds * sel.stride,
        stride=sel.stride,
        n_points=int(idx.size),
        n_samples_in_range=sel.total_in_range,
    )


@router.get("", response_model=list[SiteSummary], summary="List all sites with horizon statistics")
def list_sites(store: DataStore = Depends(get_store)) -> list[SiteSummary]:
    return [SiteSummary(**_summary(s)) for s in store.sites()]


@router.get(
    "/statistics",
    response_model=SitesStatisticsResponse,
    summary="Illumination / Earth-visibility statistics for every site (ranking)",
)
def sites_statistics(
    start: datetime | None = StartQ,
    end: datetime | None = EndQ,
    sort_by: SortKey = "mean_solar_disk_fraction",
    store: DataStore = Depends(get_store),
) -> SitesStatisticsResponse:
    eph = store.ephemeris()
    sel = select_samples(eph, start, end)
    radius = store.settings.solar_angular_radius_deg
    entries = []
    for site in store.sites():
        stats = site_statistics(site_geometry(site, eph, sel.indices, radius), eph.step_seconds)
        entries.append(
            SiteStatisticsEntry(
                id=site.id, name=site.name, lat_deg=site.lat_deg, lon_deg=site.lon_deg,
                statistics=SiteStatistics(**stats),
            )
        )
    reverse = sort_by != "longest_darkness_hours"
    entries.sort(key=lambda e: getattr(e.statistics, sort_by), reverse=reverse)
    return SitesStatisticsResponse(window=_window(eph, sel), sort_by=sort_by, sites=entries)


@router.get("/{site_id}", response_model=SiteDetail, summary="Site detail (incl. terrain pixel)")
def get_site(site_id: str, store: DataStore = Depends(get_store)) -> SiteDetail:
    site = require_site(store, site_id)
    pixel = terrain_pixel(store, site.lat_deg, site.lon_deg)
    return SiteDetail(**_summary(site), terrain_pixel=TerrainPixel(**pixel) if pixel else None)


@router.get("/{site_id}/horizon", response_model=HorizonResponse, summary="Horizon elevation mask")
def get_horizon(
    site_id: str,
    frame: Literal["grid", "true"] = Query(
        "grid",
        description="'grid': azimuth from polar-stereographic grid north (as stored in horizons.lhor). "
        "'true': resampled to local true north (clockwise).",
    ),
    store: DataStore = Depends(get_store),
) -> HorizonResponse:
    site = require_site(store, site_id)
    mask = site.horizon_grid_deg
    n = mask.shape[0]
    values = mask if frame == "grid" else geo.horizon_in_true_frame(mask, site.lon_deg)
    return HorizonResponse(
        site_id=site.id,
        frame=frame,
        azimuth_reference="grid north (+y, row decreasing), clockwise"
        if frame == "grid"
        else "local true north, clockwise",
        grid_to_true_offset_deg=site.lon_deg % 360.0,
        n_azimuths=n,
        observer_height_m=site.observer_height_m,
        azimuths_deg=to_list(np.arange(n) * (360.0 / n), 4),
        elevations_deg=to_list(values, 3),
    )


@router.get(
    "/{site_id}/illumination",
    response_model=IlluminationResponse,
    summary="Sun & Earth time series at the site with horizon masking",
)
def get_illumination(
    site_id: str,
    start: datetime | None = StartQ,
    end: datetime | None = EndQ,
    stride: int = Query(1, ge=1, description="Take every N-th ephemeris sample."),
    max_points: int = Query(5000, ge=1, description="Stride is increased automatically above this."),
    store: DataStore = Depends(get_store),
) -> IlluminationResponse:
    site = require_site(store, site_id)
    eph = store.ephemeris()
    radius = store.settings.solar_angular_radius_deg
    max_points = min(max_points, store.settings.max_series_points)

    full = select_samples(eph, start, end)
    stats = site_statistics(site_geometry(site, eph, full.indices, radius), eph.step_seconds)

    sel = select_samples(eph, start, end, stride=stride, max_points=max_points)
    g = site_geometry(site, eph, sel.indices, radius)
    return IlluminationResponse(
        site_id=site.id,
        window=_window(eph, sel),
        solar_angular_radius_deg=radius,
        times_unix=to_list(g.times_unix, 3),
        times_utc=[iso_utc(t) for t in g.times_unix],
        sun=SunSeries(
            azimuth_deg=to_list(g.sun_az, 4),
            elevation_deg=to_list(g.sun_el, 4),
            horizon_elevation_deg=to_list(g.sun_horizon, 4),
            visible_disk_fraction=to_list(g.sun_fraction, 5),
        ),
        earth=EarthSeries(
            azimuth_deg=to_list(g.earth_az, 4),
            elevation_deg=to_list(g.earth_el, 4),
            horizon_elevation_deg=to_list(g.earth_horizon, 4),
            visible=g.earth_visible.tolist(),
            distance_km=to_list(g.earth_distance_km, 2),
        ),
        statistics=SiteStatistics(**stats),
    )


@router.get(
    "/{site_id}/statistics",
    response_model=SiteStatistics,
    summary="Illumination / Earth-visibility statistics for one site",
)
def get_site_statistics(
    site_id: str,
    start: datetime | None = StartQ,
    end: datetime | None = EndQ,
    store: DataStore = Depends(get_store),
) -> SiteStatistics:
    site = require_site(store, site_id)
    eph = store.ephemeris()
    sel = select_samples(eph, start, end)
    g = site_geometry(site, eph, sel.indices, store.settings.solar_angular_radius_deg)
    return SiteStatistics(**site_statistics(g, eph.step_seconds))


@router.get(
    "/{site_id}/sky",
    response_model=SkyPositionResponse,
    summary="Instantaneous Sun/Earth position, horizon masking, visibility state, and next events at a site",
)
def get_site_sky(
    site_id: str,
    time: datetime | None = Query(
        None,
        description="Evaluation time (ISO-8601 or Unix seconds). Defaults to ephemeris start.",
    ),
    store: DataStore = Depends(get_store),
) -> SkyPositionResponse:
    site = require_site(store, site_id)
    eph = store.ephemeris()
    at_unix = eph.start_unix_utc if time is None else to_unix(time)
    assert at_unix is not None
    result = evaluate_sky_position(
        eph=eph,
        at_unix=at_unix,
        lat_deg=site.lat_deg,
        lon_deg=site.lon_deg,
        solar_radius_deg=store.settings.solar_angular_radius_deg,
        site=site,
    )
    return SkyPositionResponse(**result)
