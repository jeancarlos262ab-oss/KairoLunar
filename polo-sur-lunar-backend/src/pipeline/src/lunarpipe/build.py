"""CLI entrypoint (`python -m lunarpipe.build`) for generating client binary assets."""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import numpy as np

from lunarpipe.dem import DEMData, latlon_to_rowcol, read_dem
from lunarpipe.ephemeris import compute_ephemeris
from lunarpipe.formats import SiteHorizonRecord, write_ldem, write_leph, write_lhor
from lunarpipe.horizon import compute_horizon_mask
from lunarpipe.terrain import crop_and_downsample_terrain

# Default relative path from project root; overridable via LUNARPIPE_SITES_PATH or --sites.
DEFAULT_SITES_ENV_VAR = "LUNARPIPE_SITES_PATH"
DEFAULT_SITES_REL_PATH = Path("data") / "sites.json"


def resolve_default_sites_path() -> Path:
    """Resolve the configurable default site catalog JSON path from environment or project root."""
    env_override = os.environ.get(DEFAULT_SITES_ENV_VAR)
    if env_override:
        return Path(env_override)
    # Walk up from package directory to backend/ or workspace root, fallback to cwd.
    pkg_dir = Path(__file__).resolve()
    for parent in pkg_dir.parents:
        candidate = parent / DEFAULT_SITES_REL_PATH
        if candidate.is_file():
            return candidate
    return Path.cwd() / DEFAULT_SITES_REL_PATH


@dataclass(frozen=True)
class SiteEntry:
    """Validated site definition from the input JSON catalog."""

    site_id: str
    lat_deg: float
    lon_deg: float
    row: float
    col: float


def load_and_validate_sites(sites_path: str | Path, dem: DEMData) -> list[SiteEntry]:
    """Load a site catalog JSON array and validate coordinates against the DEM bounds.

    Each entry must be a JSON object with at least ``id``, ``lat`` (degrees), and ``lon``
    (degrees). Rejects empty catalogs, invalid coordinates, and sites outside the DEM or
    located on non-finite DEM pixels.
    """
    path = Path(sites_path)
    if not path.is_file():
        raise FileNotFoundError(f"Site catalog JSON file not found: {path}")

    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON in site catalog {path}: {exc}") from exc

    if not isinstance(raw, list) or len(raw) == 0:
        raise ValueError(f"Site catalog {path} must be a non-empty JSON array.")

    dem_h, dem_w = dem.heights.shape
    entries: list[SiteEntry] = []

    for idx, item in enumerate(raw):
        if not isinstance(item, dict):
            raise ValueError(f"Site entry #{idx} must be a JSON object.")

        site_id = item.get("id")
        if not isinstance(site_id, str) or not site_id.strip():
            raise ValueError(f"Site entry #{idx} must have a non-empty string 'id'.")

        lat = item.get("lat")
        lon = item.get("lon")
        if (
            isinstance(lat, bool)
            or isinstance(lon, bool)
            or not isinstance(lat, (int, float))
            or not isinstance(lon, (int, float))
        ):
            raise ValueError(
                f"Site {site_id!r} must have numeric 'lat' and 'lon' in degrees."
            )

        lat_f = float(lat)
        lon_f = float(lon)
        if not (math.isfinite(lat_f) and math.isfinite(lon_f)):
            raise ValueError(f"Site {site_id!r} has non-finite coordinates ({lat}, {lon}).")
        if lat_f < -90.0 or lat_f >= 90.0:
            raise ValueError(
                f"Site {site_id!r} has invalid latitude {lat_f} (expected [-90, 90))."
            )
        if lon_f < -360.0 or lon_f > 360.0:
            raise ValueError(
                f"Site {site_id!r} has invalid longitude {lon_f} (expected [-360, 360])."
            )

        row, col = latlon_to_rowcol(lat_f, lon_f, dem.transform)
        if row < 0.0 or row > float(dem_h - 1) or col < 0.0 or col > float(dem_w - 1):
            raise ValueError(
                f"Site {site_id!r} ({lat_f}, {lon_f}) maps to (row={row:.2f}, col={col:.2f}), "
                f"which is outside DEM bounds [0, {dem_h - 1}] x [0, {dem_w - 1}]."
            )

        r0 = min(dem_h - 2, max(0, int(math.floor(row))))
        c0 = min(dem_w - 2, max(0, int(math.floor(col))))
        neighborhood = dem.heights[r0 : r0 + 2, c0 : c0 + 2]
        if not np.all(np.isfinite(neighborhood)):
            raise ValueError(
                f"Site {site_id!r} falls on non-finite/NoData DEM pixels at ({row:.2f}, {col:.2f})."
            )

        entries.append(
            SiteEntry(
                site_id=site_id.strip(),
                lat_deg=lat_f,
                lon_deg=lon_f,
                row=float(row),
                col=float(col),
            )
        )

    return entries


def build_parser() -> argparse.ArgumentParser:
    """Create the CLI argument parser for ``python -m lunarpipe.build``."""
    parser = argparse.ArgumentParser(
        prog="lunarpipe.build",
        description=(
            "Process a lunar south pole GeoTIFF DEM, site catalog, and NAIF SPICE kernels "
            "into horizons.lhor, terrain.ldem, and ephemeris.leph."
        ),
    )
    parser.add_argument(
        "--dem",
        type=Path,
        required=True,
        help="Path to input GeoTIFF DEM (elevations in meters, polar stereographic projection).",
    )
    parser.add_argument(
        "--sites",
        type=Path,
        default=resolve_default_sites_path(),
        help=(
            "Path to site catalog JSON array (default configurable via "
            f"{DEFAULT_SITES_ENV_VAR} or project root {DEFAULT_SITES_REL_PATH})."
        ),
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("output"),
        help="Output directory for generated binary files (default: ./output).",
    )
    parser.add_argument(
        "--kernels-dir",
        type=Path,
        default=Path("kernels"),
        help="Directory storing NAIF SPICE kernels (default: ./kernels).",
    )
    parser.add_argument(
        "--start-utc",
        type=str,
        default="2028-01-01T00:00:00Z",
        help="Initial UTC epoch in ISO-8601 format (default: 2028-01-01T00:00:00Z).",
    )
    parser.add_argument(
        "--duration-days",
        type=float,
        default=365.0,
        help="Ephemeris duration in days (default: 365.0).",
    )
    parser.add_argument(
        "--step-seconds",
        type=float,
        default=3600.0,
        help="Ephemeris sampling step in seconds (default: 3600.0).",
    )
    parser.add_argument(
        "--observer-height",
        type=float,
        default=2.0,
        help="Observer height above local terrain in meters (default: 2.0).",
    )
    parser.add_argument(
        "--terrain-extent-km",
        type=float,
        default=160.0,
        help="Side length of the cropped terrain square in km (default: 160.0).",
    )
    parser.add_argument(
        "--terrain-size",
        type=int,
        default=256,
        help="Target maximum width/height of the downsampled terrain grid (default: 256).",
    )
    parser.add_argument(
        "--n-azimuths",
        type=int,
        default=360,
        help="Number of azimuth angles in each site horizon mask (default: 360).",
    )
    parser.add_argument(
        "--max-distance-m",
        type=float,
        default=None,
        help="Optional maximum ray-march distance in meters (default: march to DEM edge).",
    )
    parser.add_argument(
        "--no-download-kernels",
        action="store_true",
        help="Fail instead of downloading missing NAIF SPICE kernels.",
    )
    return parser


def run_build(args: argparse.Namespace) -> list[Path]:
    """Execute all pipeline stages and return paths of the generated binary files."""
    dem = read_dem(args.dem)
    sites = load_and_validate_sites(args.sites, dem)

    horizon_records: list[SiteHorizonRecord] = []
    for site in sites:
        mask = compute_horizon_mask(
            dem=dem.heights,
            obs_row=site.row,
            obs_col=site.col,
            resolution_m=dem.resolution_m,
            n_azimuths=args.n_azimuths,
            max_distance_m=args.max_distance_m,
            observer_height_m=args.observer_height,
        )
        horizon_records.append(
            SiteHorizonRecord(
                lat_deg=site.lat_deg,
                lon_deg=site.lon_deg,
                observer_height_m=args.observer_height,
                elevations_deg=mask,
            )
        )

    terrain_patch = crop_and_downsample_terrain(
        dem=dem.heights,
        transform=dem.transform,
        extent_km=args.terrain_extent_km,
        target_size=args.terrain_size,
        nodata=dem.nodata,
    )

    ephemeris = compute_ephemeris(
        start_utc=args.start_utc,
        duration_days=args.duration_days,
        kernel_dir=args.kernels_dir,
        step_seconds=args.step_seconds,
        download_kernels=not args.no_download_kernels,
    )

    out_dir: Path = args.output_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    lhor_path = write_lhor(out_dir / "horizons.lhor", horizon_records, n_azimuths=args.n_azimuths)
    ldem_path = write_ldem(out_dir / "terrain.ldem", terrain_patch.heights, terrain_patch.pixel_size_km)
    leph_path = write_leph(out_dir / "ephemeris.leph", ephemeris)

    return [lhor_path, ldem_path, leph_path]


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entrypoint returning 0 on success or 1 on any failure."""
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        generated = run_build(args)
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print("Generated binary files:")
    for path in generated:
        print(f"  - {path.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
