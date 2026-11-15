import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MOON_RADIUS_M = 1_737_400.0


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def reset_dir(path):
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=str(ROOT / "output"))
    parser.add_argument(
        "--dest",
        default=str(ROOT.parent / "polo-sur-lunar-frontend" / "public" / "data"),
    )
    args = parser.parse_args()

    output = Path(args.output)
    dest = Path(args.dest)
    terrain_src = output / "terrain"
    horizon_src = output / "horizon"
    terrain_dst = dest / "terrain"
    horizon_dst = dest / "horizon"

    dest.mkdir(parents=True, exist_ok=True)
    reset_dir(terrain_dst)
    reset_dir(horizon_dst)

    sites = {}
    source = None

    for meta_path in sorted(terrain_src.glob("*.json")):
        meta = read_json(meta_path)
        site_id = meta["id"]
        bin_path = terrain_src / f"{site_id}.bin"
        expected = meta["size"] * meta["size"] * 4
        if not bin_path.exists() or bin_path.stat().st_size != expected:
            print(f"{site_id:16s} terreno omitido (archivo .bin incompleto)")
            continue
        shutil.copy2(bin_path, terrain_dst / bin_path.name)
        source = source or meta.get("source")
        entry = sites.setdefault(
            site_id,
            {"id": site_id, "name": meta["name"], "lat": meta["lat"], "lon": meta["lon"]},
        )
        entry["terrain"] = {
            "file": f"terrain/{site_id}.bin",
            "size": meta["size"],
            "extent_m": meta["extent_m"],
            "step_m": meta["step_m"],
            "site_height_m": meta["site_height_m"],
            "min_m": meta["min_m"],
            "max_m": meta["max_m"],
            "dtype": meta["dtype"],
            "layout": meta["layout"],
        }

    for meta_path in sorted(horizon_src.glob("*.json")):
        meta = read_json(meta_path)
        site_id = meta["id"]
        shutil.copy2(meta_path, horizon_dst / meta_path.name)
        source = source or meta.get("source")
        entry = sites.setdefault(
            site_id,
            {"id": site_id, "name": meta["name"], "lat": meta["lat"], "lon": meta["lon"]},
        )
        entry["horizon"] = {
            "file": f"horizon/{site_id}.json",
            "observer_height_m": meta["observer_height_m"],
            "max_radius_m": meta["max_radius_m"],
            "azimuth_step_deg": meta["azimuth_step_deg"],
            "min_reach_km": meta["min_reach_km"],
            "min_deg": meta["min_deg"],
            "max_deg": meta["max_deg"],
            "mean_deg": meta["mean_deg"],
        }

    manifest = {
        "version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "moon_radius_m": MOON_RADIUS_M,
        "dem_source": source,
        "sites": list(sites.values()),
    }
    (dest / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"Destino: {dest}")
    for entry in manifest["sites"]:
        parts = [name for name in ("terrain", "horizon") if name in entry]
        print(f"{entry['id']:16s} {', '.join(parts)}")


if __name__ == "__main__":
    main()