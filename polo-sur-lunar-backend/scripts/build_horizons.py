import argparse
import json
from pathlib import Path

import numpy as np

from lunar.dem import Dem
from lunar.horizon import horizon_mask
from lunar.sites import load_sites


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dem", default="data/dem/LDEM_80S_80MPP_ADJ.tiff")
    parser.add_argument("--sites", default="data/sites.json")
    parser.add_argument("--out", default="output/horizon")
    parser.add_argument("--observer-height", type=float, default=2.0)
    parser.add_argument("--max-radius-km", type=float, default=150.0)
    args = parser.parse_args()

    dem = Dem(args.dem)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    for site in load_sites(args.sites):
        try:
            mask, reach, site_height = horizon_mask(
                dem,
                site["lat"],
                site["lon"],
                observer_height_m=args.observer_height,
                max_radius_m=args.max_radius_km * 1000.0,
            )
        except ValueError:
            print(f"{site['id']:16s} omitido (fuera del DEM)")
            continue

        finite = mask[np.isfinite(mask)]
        meta = {
            "id": site["id"],
            "name": site["name"],
            "lat": site["lat"],
            "lon": site["lon"],
            "site_height_m": site_height,
            "observer_height_m": args.observer_height,
            "max_radius_m": args.max_radius_km * 1000.0,
            "azimuth_step_deg": 360.0 / mask.size,
            "azimuth_origin": "0 = norte, 90 = este",
            "min_reach_km": float(reach.min() / 1000.0),
            "min_deg": float(finite.min()),
            "max_deg": float(finite.max()),
            "mean_deg": float(finite.mean()),
            "elevation_deg": [None if not np.isfinite(v) else round(float(v), 3) for v in mask],
            "source": Path(args.dem).name,
        }
        (out / f"{site['id']}.json").write_text(
            json.dumps(meta, ensure_ascii=False), encoding="utf-8"
        )
        print(
            f"{site['id']:16s} ok  horizonte {meta['min_deg']:7.2f}° a {meta['max_deg']:7.2f}°  "
            f"media {meta['mean_deg']:6.2f}°  alcance mín {meta['min_reach_km']:6.1f} km"
        )


if __name__ == "__main__":
    main()