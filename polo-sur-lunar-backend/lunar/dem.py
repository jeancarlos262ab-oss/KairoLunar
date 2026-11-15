import numpy as np
import rasterio

MOON_RADIUS_M = 1_737_400.0


def latlon_to_xy(lat_deg, lon_deg):
    lat = np.asarray(lat_deg, dtype=np.float64)
    lon = np.radians(np.asarray(lon_deg, dtype=np.float64))
    colat = np.radians(90.0 + lat)
    rho = 2.0 * MOON_RADIUS_M * np.tan(colat / 2.0)
    return rho * np.sin(lon), rho * np.cos(lon)


def xy_to_latlon(x, y):
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    rho = np.hypot(x, y)
    colat = 2.0 * np.arctan(rho / (2.0 * MOON_RADIUS_M))
    lat = np.degrees(colat) - 90.0
    lon = np.degrees(np.arctan2(x, y))
    return lat, lon


class Dem:
    def __init__(self, path):
        with rasterio.open(path) as src:
            wkt = src.crs.to_wkt() if src.crs else ""
            transform = src.transform
            if "1737400" not in wkt:
                raise ValueError("El CRS del DEM no usa una esfera de 1737400 m")
            if transform.b != 0 or transform.d != 0 or transform.e != -transform.a:
                raise ValueError("El DEM no es una rejilla regular norte-arriba")
            self.data = src.read(1).astype(np.float32)
            self.width = src.width
            self.height = src.height
            self.res = float(transform.a)
            self.left = float(src.bounds.left)
            self.top = float(src.bounds.top)
            nodata = src.nodata
        if nodata is not None and not np.isnan(nodata):
            self.data[self.data == nodata] = np.nan

    def xy_to_colrow(self, x, y):
        col = (np.asarray(x, dtype=np.float64) - self.left) / self.res - 0.5
        row = (self.top - np.asarray(y, dtype=np.float64)) / self.res - 0.5
        return col, row

    def sample_xy(self, x, y):
        col, row = np.broadcast_arrays(*self.xy_to_colrow(x, y))
        shape = col.shape
        c = col.ravel()
        r = row.ravel()
        c0 = np.floor(c).astype(np.int64)
        r0 = np.floor(r).astype(np.int64)
        fc = c - c0
        fr = r - r0
        inside = (c0 >= 0) & (c0 + 1 < self.width) & (r0 >= 0) & (r0 + 1 < self.height)
        out = np.full(c.shape, np.nan, dtype=np.float64)
        idx = np.where(inside)[0]
        cc = c0[idx]
        rr = r0[idx]
        wc = fc[idx]
        wr = fr[idx]
        out[idx] = (
            self.data[rr, cc] * (1 - wc) * (1 - wr)
            + self.data[rr, cc + 1] * wc * (1 - wr)
            + self.data[rr + 1, cc] * (1 - wc) * wr
            + self.data[rr + 1, cc + 1] * wc * wr
        )
        return out.reshape(shape)

    def sample(self, lat, lon):
        x, y = latlon_to_xy(lat, lon)
        return self.sample_xy(x, y)

    def contains(self, lat, lon):
        return np.isfinite(self.sample(lat, lon))