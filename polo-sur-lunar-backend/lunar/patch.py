import numpy as np

from .dem import MOON_RADIUS_M, latlon_to_xy


def enu_basis(lat_deg, lon_deg):
    lat = np.radians(lat_deg)
    lon = np.radians(lon_deg)
    up = np.array([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])
    east = np.array([-np.sin(lon), np.cos(lon), 0.0])
    north = np.array([-np.sin(lat) * np.cos(lon), -np.sin(lat) * np.sin(lon), np.cos(lat)])
    return up, east, north


def patch_xy(lat_deg, lon_deg, extent_m, size):
    radius = MOON_RADIUS_M
    step = extent_m / (size - 1)
    offsets = (np.arange(size) - (size - 1) / 2.0) * step
    east_m, north_m = np.meshgrid(offsets, -offsets)
    delta = np.hypot(east_m, north_m) / radius
    scale = np.sinc(delta / np.pi) / radius
    up, east, north = enu_basis(lat_deg, lon_deg)
    p = (
        np.cos(delta)[..., None] * up
        + (scale * east_m)[..., None] * east
        + (scale * north_m)[..., None] * north
    )
    x = 2.0 * radius * p[..., 1] / (1.0 - p[..., 2])
    y = 2.0 * radius * p[..., 0] / (1.0 - p[..., 2])
    return x, y, delta, step


def build_patch(dem, lat_deg, lon_deg, extent_m, size):
    x, y, delta, step = patch_xy(lat_deg, lon_deg, extent_m, size)
    heights = dem.sample_xy(x, y)
    x0, y0 = latlon_to_xy(lat_deg, lon_deg)
    site_height = float(dem.sample_xy(x0, y0))
    radius = MOON_RADIUS_M
    local = (radius + heights) * np.cos(delta) - (radius + site_height)
    return local.astype(np.float32), site_height, step