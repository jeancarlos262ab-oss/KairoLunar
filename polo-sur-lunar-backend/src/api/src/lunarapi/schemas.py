"""Pydantic response/request models (OpenAPI contract for the web client)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class ErrorResponse(BaseModel):
    detail: str
    dataset: str | None = None


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    version: str
    data_dir: str
    datasets: dict[str, bool]


# ------------------------------------------------------------------ datasets
class DatasetInfo(BaseModel):
    name: str
    filename: str
    available: bool
    size_bytes: int | None = None
    modified_utc: datetime | None = None
    error: str | None = None
    header: dict[str, Any] | None = None
    raw_url: str


class DatasetsResponse(BaseModel):
    data_dir: str
    sites_catalog: str | None
    datasets: list[DatasetInfo]


# ------------------------------------------------------------------ sites
class TerrainPixel(BaseModel):
    row: float = Field(description="Continuous row on terrain.ldem (0 = north).")
    col: float = Field(description="Continuous column on terrain.ldem.")
    inside: bool
    elevation_m: float | None = None


class HorizonStats(BaseModel):
    min_deg: float
    max_deg: float
    mean_deg: float


class SiteSummary(BaseModel):
    id: str
    index: int
    name: str | None = None
    lat_deg: float
    lon_deg: float
    observer_height_m: float
    x_m: float = Field(description="South Polar Stereographic X (m).")
    y_m: float = Field(description="South Polar Stereographic Y (m).")
    horizon: HorizonStats
    metadata: dict[str, Any] = Field(default_factory=dict)


class SiteDetail(SiteSummary):
    terrain_pixel: TerrainPixel | None = None


class HorizonResponse(BaseModel):
    site_id: str
    frame: Literal["grid", "true"]
    azimuth_reference: str
    grid_to_true_offset_deg: float = Field(
        description="grid_azimuth = (true_azimuth + offset) mod 360 (offset = site longitude)."
    )
    n_azimuths: int
    observer_height_m: float
    azimuths_deg: list[float]
    elevations_deg: list[float]


class SunSeries(BaseModel):
    azimuth_deg: list[float]
    elevation_deg: list[float]
    horizon_elevation_deg: list[float]
    visible_disk_fraction: list[float]


class EarthSeries(BaseModel):
    azimuth_deg: list[float]
    elevation_deg: list[float]
    horizon_elevation_deg: list[float]
    visible: list[bool]
    distance_km: list[float]


class SiteStatistics(BaseModel):
    n_samples: int
    mean_solar_disk_fraction: float
    sun_any_visible_pct: float
    sun_fully_visible_pct: float
    earth_visible_pct: float
    sun_and_earth_visible_pct: float
    longest_darkness_hours: float
    longest_earth_blackout_hours: float
    max_sun_elevation_deg: float
    min_sun_elevation_deg: float


class TimeWindow(BaseModel):
    start_utc: str
    end_utc: str
    step_seconds: float
    stride: int
    n_points: int
    n_samples_in_range: int


class IlluminationResponse(BaseModel):
    site_id: str
    window: TimeWindow
    solar_angular_radius_deg: float
    times_unix: list[float]
    times_utc: list[str]
    sun: SunSeries
    earth: EarthSeries
    statistics: SiteStatistics = Field(description="Computed on every sample in range (no decimation).")


class SiteStatisticsEntry(BaseModel):
    id: str
    name: str | None = None
    lat_deg: float
    lon_deg: float
    statistics: SiteStatistics


class SitesStatisticsResponse(BaseModel):
    window: TimeWindow
    sort_by: str
    sites: list[SiteStatisticsEntry]


# ------------------------------------------------------------------ terrain
class TerrainMetadata(BaseModel):
    width: int
    height: int
    pixel_size_km: float
    resolution_m: float
    extent_km: dict[str, float]
    z_min_m: float
    z_max_m: float
    quantization_step_m: float
    center: dict[str, float]
    bounds_xy_m: dict[str, float]
    orientation: str


class TerrainHeightsJson(BaseModel):
    width: int
    height: int
    stride: int
    pixel_size_km: float
    z_min_m: float
    z_max_m: float
    heights_m: list[list[float]]


class ElevationResponse(BaseModel):
    lat_deg: float
    lon_deg: float
    x_m: float
    y_m: float
    row: float
    col: float
    elevation_m: float


# ------------------------------------------------------------------ ephemeris
class EphemerisMetadata(BaseModel):
    n_samples: int
    start_utc: str
    end_utc: str
    start_unix: float
    end_unix: float
    step_seconds: float
    frame: str = "MOON_ME"
    aberration_correction: str = "LT+S"


class EphemerisSamples(BaseModel):
    window: TimeWindow
    times_unix: list[float]
    times_utc: list[str]
    sun_dir: list[list[float]]
    earth_dir: list[list[float]]
    earth_distance_km: list[float]
    subsolar_lat_deg: list[float]
    subsolar_lon_deg: list[float]
    subearth_lat_deg: list[float]
    subearth_lon_deg: list[float]


class EphemerisAt(BaseModel):
    time_utc: str
    time_unix: float
    interpolated: bool
    sun_dir: list[float]
    earth_dir: list[float]
    earth_distance_km: float
    subsolar_lat_deg: float
    subsolar_lon_deg: float
    subearth_lat_deg: float
    subearth_lon_deg: float


# ------------------------------------------------------------------ compute
class SolarDiskRequest(BaseModel):
    sun_elevation_deg: float
    horizon_elevation_deg: float
    solar_angular_radius_deg: float = Field(0.2666, gt=0)


class SolarDiskResponse(BaseModel):
    visible_fraction: float


class HorizonComputeRequest(BaseModel):
    lat_deg: float = Field(ge=-90, lt=90)
    lon_deg: float = Field(ge=-360, le=360)
    observer_height_m: float = Field(2.0, ge=0)
    n_azimuths: int = Field(360, ge=1, le=7200)
    max_distance_m: float | None = Field(None, gt=0)
    frame: Literal["grid", "true"] = "grid"


class HorizonComputeResponse(BaseModel):
    source: str
    lat_deg: float
    lon_deg: float
    row: float
    col: float
    resolution_m: float
    frame: Literal["grid", "true"]
    grid_to_true_offset_deg: float
    azimuths_deg: list[float]
    elevations_deg: list[float]


class SkyPositionRequest(BaseModel):
    lat_deg: float = Field(ge=-90, lt=90)
    lon_deg: float = Field(ge=-360, le=360)
    time: datetime
    site_id: str | None = Field(None, description="Optional: use this site's horizon mask.")


class BodyPosition(BaseModel):
    azimuth_deg: float
    elevation_deg: float
    horizon_elevation_deg: float | None = None
    visible: bool | None = None


class VisibilityEvent(BaseModel):
    type: Literal["sunrise", "sunset", "earthrise", "earthset"]
    time_utc: str
    time_unix: float
    in_hours: float


class SkyPositionResponse(BaseModel):
    time_utc: str
    lat_deg: float
    lon_deg: float
    site_id: str | None = None
    sun: BodyPosition
    sun_visible_disk_fraction: float | None = None
    earth: BodyPosition
    earth_distance_km: float
    state: (
        Literal[
            "sunlit_and_earth_link",
            "sunlit_no_link",
            "dark_with_earth_link",
            "dark_no_link",
        ]
        | None
    ) = None
    next_sun_event: VisibilityEvent | None = None
    next_earth_event: VisibilityEvent | None = None
