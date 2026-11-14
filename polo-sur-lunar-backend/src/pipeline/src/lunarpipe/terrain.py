"""Terrain cropping and block-averaged downsampling for client visualization."""

from __future__ import annotations

import math
from typing import NamedTuple

import numpy as np
from affine import Affine

from lunarpipe.dem import LUNAR_RADIUS_M, latlon_to_xy, validate_transform, xy_to_rowcol


class TerrainPatch(NamedTuple):
    """Cropped and downsampled terrain elevation patch.

    Attributes:
        heights: 2D ``float32`` elevation grid in meters (north at row 0, finite values only).
        pixel_size_km: Ground sampling distance per pixel in kilometers.
    """

    heights: np.ndarray
    pixel_size_km: float


def _fill_missing_nearest(grid: np.ndarray) -> np.ndarray:
    """Fill NaN cells in a 2D array using the Euclidean nearest finite cell."""
    out = grid.astype(np.float64, copy=True)
    valid = np.isfinite(out)
    if np.all(valid):
        return out
    if not np.any(valid):
        raise ValueError("Cannot fill terrain grid with no finite cells.")

    h, w = out.shape
    rows, cols = np.indices((h, w), dtype=np.int32)
    src_r = np.where(valid, rows, -1)
    src_c = np.where(valid, cols, -1)
    best_d2 = np.where(valid, 0, np.iinfo(np.int64).max)

    offsets = (
        (-1, 0),
        (1, 0),
        (0, -1),
        (0, 1),
        (-1, -1),
        (-1, 1),
        (1, -1),
        (1, 1),
    )

    # Propagate nearest valid cell indices outward until every cell has a finite value.
    while not np.all(valid):
        changed = False
        for dr, dc in offsets:
            r_dst_start = max(0, dr)
            r_dst_end = h + min(0, dr)
            c_dst_start = max(0, dc)
            c_dst_end = w + min(0, dc)

            r_src_start = max(0, -dr)
            r_src_end = h + min(0, -dr)
            c_src_start = max(0, -dc)
            c_src_end = w + min(0, -dc)

            cand_valid = valid[r_src_start:r_src_end, c_src_start:c_src_end]
            cand_r = src_r[r_src_start:r_src_end, c_src_start:c_src_end]
            cand_c = src_c[r_src_start:r_src_end, c_src_start:c_src_end]

            dst_rows = rows[r_dst_start:r_dst_end, c_dst_start:c_dst_end]
            dst_cols = cols[r_dst_start:r_dst_end, c_dst_start:c_dst_end]
            dst_d2 = best_d2[r_dst_start:r_dst_end, c_dst_start:c_dst_end]

            cand_d2 = (dst_rows.astype(np.int64) - cand_r.astype(np.int64)) ** 2 + (
                dst_cols.astype(np.int64) - cand_c.astype(np.int64)
            ) ** 2
            improve = cand_valid & (cand_d2 < dst_d2)
            if np.any(improve):
                dst_d2[improve] = cand_d2[improve]
                src_r[r_dst_start:r_dst_end, c_dst_start:c_dst_end][improve] = cand_r[improve]
                src_c[r_dst_start:r_dst_end, c_dst_start:c_dst_end][improve] = cand_c[improve]
                valid[r_dst_start:r_dst_end, c_dst_start:c_dst_end][improve] = True
                changed = True
        if not changed:
            break

    filled_mask = ~np.isfinite(out)
    out[filled_mask] = out[src_r[filled_mask], src_c[filled_mask]]
    return out


def crop_and_downsample_terrain(
    dem: np.ndarray,
    transform: Affine,
    extent_km: float = 160.0,
    target_size: int = 256,
    center_lat_deg: float = -90.0,
    center_lon_deg: float = 0.0,
    nodata: float | None = None,
    lunar_radius_m: float = LUNAR_RADIUS_M,
) -> TerrainPatch:
    """Crop a square around a target point and block-average it to target resolution.

    Args:
        dem: 2D array of terrain elevations in meters (shape ``(height, width)``).
        transform: Validated affine transform of ``dem``.
        extent_km: Side length of the square crop in kilometers (default ``160.0``).
        target_size: Maximum output width/height in pixels (default ``256``).
        center_lat_deg: Selenographic latitude of crop center in degrees (default ``-90.0``).
        center_lon_deg: Selenographic longitude of crop center in degrees (default ``0.0``).
        nodata: Optional NoData sentinel value to ignore alongside ``NaN``/``Inf``.
        lunar_radius_m: Lunar radius in meters for stereographic projection.

    Returns:
        :class:`TerrainPatch` containing finite ``float32`` heights in meters and
        resulting ``pixel_size_km``.

    Raises:
        ValueError: If inputs are invalid, the crop window falls completely outside the DEM,
            or there are no valid elevation pixels within the window.
    """
    arr = np.asarray(dem, dtype=np.float64)
    if arr.ndim != 2 or arr.shape[0] < 1 or arr.shape[1] < 1:
        raise ValueError(f"DEM must be a non-empty 2D array, got shape {arr.shape}.")
    validate_transform(transform)

    if not math.isfinite(extent_km) or extent_km <= 0.0:
        raise ValueError(f"extent_km must be finite and > 0, got {extent_km}.")
    if isinstance(target_size, bool) or not isinstance(target_size, (int, np.integer)) or target_size < 1:
        raise ValueError(f"target_size must be an integer >= 1, got {target_size}.")

    cx_m, cy_m = latlon_to_xy(center_lat_deg, center_lon_deg, lunar_radius_m=lunar_radius_m)
    half_extent_m = 0.5 * extent_km * 1000.0

    row_start_f, col_start_f = xy_to_rowcol(cx_m - half_extent_m, cy_m + half_extent_m, transform)
    row_end_f, col_end_f = xy_to_rowcol(cx_m + half_extent_m, cy_m - half_extent_m, transform)

    row_start = int(math.floor(row_start_f))
    row_end = int(math.ceil(row_end_f))
    col_start = int(math.floor(col_start_f))
    col_end = int(math.ceil(col_end_f))

    crop_h = row_end - row_start
    crop_w = col_end - col_start
    if crop_h < 1 or crop_w < 1:
        raise ValueError("Computed crop window has empty dimensions.")

    dem_h, dem_w = arr.shape
    ir0 = max(0, row_start)
    ir1 = min(dem_h, row_end)
    ic0 = max(0, col_start)
    ic1 = min(dem_w, col_end)

    if ir0 >= ir1 or ic0 >= ic1:
        raise ValueError(
            "Requested crop window does not intersect the DEM bounds "
            f"({row_start}:{row_end}, {col_start}:{col_end} vs {dem_h}x{dem_w})."
        )

    sub = arr[ir0:ir1, ic0:ic1].copy()
    invalid_mask = ~np.isfinite(sub)
    if nodata is not None and math.isfinite(nodata):
        invalid_mask |= sub == float(nodata)
    sub[invalid_mask] = np.nan

    if not np.any(np.isfinite(sub)):
        raise ValueError("Crop window intersects DEM, but contains no valid elevation pixels.")

    out_h = min(int(target_size), crop_h)
    out_w = min(int(target_size), crop_w)

    r_edges = row_start + (np.arange(out_h + 1, dtype=np.int64) * crop_h) // out_h
    c_edges = col_start + (np.arange(out_w + 1, dtype=np.int64) * crop_w) // out_w

    bi_indices = [
        bi for bi in range(out_h) if max(ir0, int(r_edges[bi])) < min(ir1, int(r_edges[bi + 1]))
    ]
    bj_indices = [
        bj for bj in range(out_w) if max(ic0, int(c_edges[bj])) < min(ic1, int(c_edges[bj + 1]))
    ]

    if not bi_indices or not bj_indices:
        raise ValueError("No intersecting blocks found in crop window.")

    bi_start, bi_end = bi_indices[0], bi_indices[-1] + 1
    bj_start, bj_end = bj_indices[0], bj_indices[-1] + 1

    row_offsets = np.array(
        [max(ir0, int(r_edges[bi])) - ir0 for bi in range(bi_start, bi_end)],
        dtype=np.int64,
    )
    col_offsets = np.array(
        [max(ic0, int(c_edges[bj])) - ic0 for bj in range(bj_start, bj_end)],
        dtype=np.int64,
    )

    sub_valid = np.isfinite(sub)
    sub_vals = np.where(sub_valid, sub, 0.0)
    sub_counts = sub_valid.astype(np.int64)

    row_sums = np.add.reduceat(sub_vals, row_offsets, axis=0)
    row_cnts = np.add.reduceat(sub_counts, row_offsets, axis=0)

    block_sums = np.add.reduceat(row_sums, col_offsets, axis=1)
    block_cnts = np.add.reduceat(row_cnts, col_offsets, axis=1)

    out = np.full((out_h, out_w), np.nan, dtype=np.float64)
    out_slice = out[bi_start:bi_end, bj_start:bj_end]
    has_data = block_cnts > 0
    out_slice[has_data] = block_sums[has_data] / block_cnts[has_data]

    out = _fill_missing_nearest(out)
    pixel_size_km = float(extent_km) / float(out_w)
    return TerrainPatch(heights=out.astype(np.float32), pixel_size_km=pixel_size_km)
