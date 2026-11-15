import numpy as np

from .dem import MOON_RADIUS_M, latlon_to_xy
from .patch import enu_basis


def horizon_mask(
    dem,
    lat_deg,
    lon_deg,
    observer_height_m=2.0,
    max_radius_m=150_000.0,
    step_m=None,
    n_azimuths=360,
):
    radius = MOON_RADIUS_M
    step = step_m or dem.res
    x0, y0 = latlon_to_xy(lat_deg, lon_deg)
    site_height = float(dem.sample_xy(x0, y0))
    if not np.isfinite(site_height):
        raise ValueError("El sitio esta fuera del DEM")

    distances = np.arange(step, max_radius_m + step, step)
    delta = distances / radius
    azimuth = np.radians(np.arange(n_azimuths) * 360.0 / n_azimuths)

    up, east, north = enu_basis(lat_deg, lon_deg)
    direction = np.cos(azimuth)[:, None] * north + np.sin(azimuth)[:, None] * east
    p = (
        np.cos(delta)[None, :, None] * up
        + np.sin(delta)[None, :, None] * direction[:, None, :]
    )
    x = 2.0 * radius * p[..., 1] / (1.0 - p[..., 2])
    y = 2.0 * radius * p[..., 0] / (1.0 - p[..., 2])

    heights = dem.sample_xy(x, y)
    eye = radius + site_height + observer_height_m
    elevation = np.degrees(
        np.arctan2(
            (radius + heights) * np.cos(delta) - eye,
            (radius + heights) * np.sin(delta),
        )
    )

    valid = np.isfinite(elevation)
    mask = np.where(valid, elevation, -np.inf).max(axis=1)
    has_data = valid.any(axis=1)
    mask = np.where(has_data, mask, np.nan)
    last = distances.size - 1 - np.argmax(valid[:, ::-1], axis=1)
    reach = np.where(has_data, distances[last], 0.0)
    return mask, reach, site_height