import argparse
import json
import re
from pathlib import Path

import numpy as np

from lunar.dem import latlon_to_xy, xy_to_latlon

AREA_TOLERANCE = 0.01


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def polygon_stats(ring):
    points = np.asarray(ring, dtype=np.float64)
    if np.allclose(points[0], points[-1]):
        points = points[:-1]
    x, y = latlon_to_xy(points[:, 1], points[:, 0])
    area_m2 = 0.5 * abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))
    lat, lon = xy_to_latlon(x.mean(), y.mean())
    return float(lat), float(lon), float(area_m2) / 1e6


def format_entry(entry):
    fields = ", ".join(
        f"{json.dumps(key)}: {json.dumps(value, ensure_ascii=False)}" for key, value in entry.items()
    )
    return "  { " + fields + " }"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--geojson", default="data/artemis/A3_9regions-lonlat-simplified.geojson")
    parser.add_argument("--sites", default="data/sites.json")
    parser.add_argument("--decimals", type=int, default=4)
    args = parser.parse_args()

    collection = json.loads(Path(args.geojson).read_text(encoding="utf-8"))
    if collection.get("type") != "FeatureCollection":
        raise SystemExit("El geojson debe ser un FeatureCollection")

    sites_path = Path(args.sites)
    sites = json.loads(sites_path.read_text(encoding="utf-8"))

    generated = []
    for feature in collection["features"]:
        props = feature["properties"]
        geometry = feature["geometry"]
        if geometry["type"] != "Polygon":
            raise SystemExit(f"{props.get('Region')}: se esperaba un Polygon")
        lat, lon, area = polygon_stats(geometry["coordinates"][0])
        declared = props.get("Area_km2")
        warning = ""
        if declared and abs(area - declared) / declared > AREA_TOLERANCE:
            warning = f"  AVISO: area calculada {area:.0f} km2 vs declarada {declared:.0f} km2"
        entry = {
            "id": slugify(props["Region"]),
            "name": props["Region"],
            "lat": round(lat, args.decimals),
            "lon": round(lon, args.decimals),
        }
        generated.append(entry)
        print(f"{entry['id']:22s} {entry['lat']:10.4f} {entry['lon']:10.4f}  {area:7.0f} km2{warning}")

    ids = [entry["id"] for entry in generated]
    if len(set(ids)) != len(ids):
        raise SystemExit("El geojson produce ids repetidos")

    pending = {entry["id"]: entry for entry in generated}
    merged = []
    seen = set()
    for site in sites:
        if site["id"] in seen:
            print(f"{site['id']:22s} duplicado en sites.json, se elimina")
            continue
        seen.add(site["id"])
        merged.append(pending.pop(site["id"], site))
    merged.extend(pending.values())

    text = "[\n" + ",\n".join(format_entry(entry) for entry in merged) + "\n]\n"
    sites_path.write_text(text, encoding="utf-8")
    print(f"{len(generated)} regiones Artemis, {len(merged)} sitios en total -> {sites_path}")


if __name__ == "__main__":
    main()