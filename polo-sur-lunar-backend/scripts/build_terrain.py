import argparse
import json
from pathlib import Path

import numpy as np

from lunar.dem import Dem
from lunar.patch import build_patch
from lunar.sites import load_sites


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dem", default="data/dem/LDEM_80S_80MPP_ADJ.tiff")
    parser.add_argument("--sites", default="data/sites.json")
    parser.add_argument("--out", default="output/terrain")
    parser.add_argument("--extent-km", type=float, default=20.0)
    parser.add_argument("--size", type=int, default=257)
    args = parser.parse_args()

    dem = Dem(args.dem)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    extent_m = args.extent_km * 1000.0

    for site in load_sites(args.sites):
        patch, site_height, step = build_patch(dem, site["lat"], site["lon"], extent_m, args.size)
        coverage = float(np.isfinite(patch).mean())
        if coverage < 1.0:
            print(f"{site['id']:16s} omitido (cobertura {coverage * 100:5.1f} %)")
            continue

        patch.astype("<f4").tofile(out / f"{site['id']}.bin")
        meta = {
            "id": site["id"],
            "name": site["name"],
            "lat": site["lat"],
            "lon": site["lon"],
            "size": args.size,
            "extent_m": extent_m,
            "step_m": step,
            "site_height_m": site_height,
            "min_m": float(patch.min()),
            "max_m": float(patch.max()),
            "dtype": "float32-le",
            "layout": "fila mayor, fila 0 = norte, columna 0 = oeste",
            "unit": "metros sobre el plano tangente del sitio",
            "source": Path(args.dem).name,
        }
        (out / f"{site['id']}.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(
            f"{site['id']:16s} ok  relieve {meta['min_m']:8.1f} a {meta['max_m']:8.1f} m  "
            f"({args.size}x{args.size}, paso {step:.1f} m)"
        )


if __name__ == "__main__":
    main()