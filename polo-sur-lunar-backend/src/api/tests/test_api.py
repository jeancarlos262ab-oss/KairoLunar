from __future__ import annotations

import numpy as np

P = "/api/v1"


def test_health_and_datasets(client):
    r = client.get(f"{P}/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"
    d = client.get(f"{P}/datasets").json()
    assert {x["name"] for x in d["datasets"]} == {"horizons", "terrain", "ephemeris"}
    assert all(x["available"] for x in d["datasets"])
    raw = client.get(f"{P}/datasets/horizons/raw")
    assert raw.status_code == 200 and raw.content[:4] == b"LHOR"


def test_missing_data_returns_503(empty_client):
    assert empty_client.get(f"{P}/health").json()["status"] == "degraded"
    r = empty_client.get(f"{P}/sites")
    assert r.status_code == 503 and r.json()["dataset"] == "horizons"
    assert empty_client.get(f"{P}/terrain").status_code == 503
    assert empty_client.get(f"{P}/datasets/ephemeris/raw").status_code == 503


def test_sites_use_catalog_ids(client):
    sites = client.get(f"{P}/sites").json()
    assert [s["id"] for s in sites] == ["shackleton_rim", "connecting_ridge"]
    assert sites[0]["name"] == "Shackleton Rim" and sites[0]["metadata"] == {"priority": 1}
    assert sites[1]["horizon"]["max_deg"] == 10.0
    detail = client.get(f"{P}/sites/shackleton_rim").json()
    assert detail["terrain_pixel"]["inside"] is True
    assert client.get(f"{P}/sites/site-1").json()["id"] == "connecting_ridge"
    assert client.get(f"{P}/sites/nope").status_code == 404


def test_horizon_frames(client):
    g = client.get(f"{P}/sites/connecting_ridge/horizon").json()
    assert g["n_azimuths"] == 36 and len(g["elevations_deg"]) == 36
    t = client.get(f"{P}/sites/connecting_ridge/horizon", params={"frame": "true"}).json()
    assert t["frame"] == "true" and t["grid_to_true_offset_deg"] == 222.5


def test_illumination_series(client):
    lit = client.get(f"{P}/sites/shackleton_rim/illumination").json()
    assert lit["window"]["n_points"] == 25
    assert len(lit["sun"]["visible_disk_fraction"]) == 25
    assert lit["statistics"]["mean_solar_disk_fraction"] > 0.9
    dark = client.get(f"{P}/sites/connecting_ridge/illumination").json()
    assert dark["statistics"]["sun_any_visible_pct"] == 0.0
    assert dark["statistics"]["longest_darkness_hours"] == 25.0
    # Auto-decimation and time window.
    dec = client.get(
        f"{P}/sites/shackleton_rim/illumination",
        params={"max_points": 5, "start": "2028-01-01T02:00:00Z", "end": "2028-01-01T12:00:00Z"},
    ).json()
    assert dec["window"]["n_points"] <= 5 and dec["window"]["n_samples_in_range"] == 11
    assert dec["statistics"]["n_samples"] == 11


def test_out_of_range_window(client):
    r = client.get(f"{P}/sites/shackleton_rim/illumination", params={"start": "2030-01-01T00:00:00Z"})
    assert r.status_code == 400


def test_sites_statistics_ranking(client):
    r = client.get(f"{P}/sites/statistics").json()
    assert [s["id"] for s in r["sites"]] == ["shackleton_rim", "connecting_ridge"]
    one = client.get(f"{P}/sites/connecting_ridge/statistics").json()
    assert one["sun_any_visible_pct"] == 0.0


def test_terrain_endpoints(client):
    meta = client.get(f"{P}/terrain").json()
    assert meta["width"] == 64 and meta["resolution_m"] == 2500.0
    assert meta["center"]["row"] == 32.0 and meta["center"]["col"] == 32.0
    assert meta["bounds_xy_m"] == {"x_min": -80000.0, "x_max": 80000.0, "y_min": -80000.0, "y_max": 80000.0}
    js = client.get(f"{P}/terrain/heights", params={"stride": 2}).json()
    assert js["width"] == 32 and len(js["heights_m"]) == 32
    b = client.get(f"{P}/terrain/heights", params={"encoding": "float32"})
    assert b.headers["x-width"] == "64"
    arr = np.frombuffer(b.content, dtype="<f4")
    assert arr.size == 64 * 64 and arr.max() > 400
    u = client.get(f"{P}/terrain/heights", params={"encoding": "uint16"})
    assert len(u.content) == 64 * 64 * 2
    pole = client.get(f"{P}/terrain/elevation", params={"lat": -90.0, "lon": 0.0}).json()
    assert pole["row"] == 32.0 and pole["col"] == 32.0
    e = client.get(f"{P}/terrain/elevation", params={"lat": -89.8, "lon": 0}).json()
    assert -600 < e["elevation_m"] < 600
    assert client.get(f"{P}/terrain/elevation", params={"lat": -80, "lon": 0}).status_code == 400


def test_ephemeris_endpoints(client):
    meta = client.get(f"{P}/ephemeris").json()
    assert meta["n_samples"] == 25 and meta["start_utc"] == "2028-01-01T00:00:00Z"
    s = client.get(f"{P}/ephemeris/samples", params={"stride": 6}).json()
    assert s["window"]["n_points"] == 5 and len(s["sun_dir"][0]) == 3
    assert abs(s["subsolar_lat_deg"][0] + 1.5) < 1e-3
    at = client.get(f"{P}/ephemeris/at", params={"time": "2028-01-01T00:30:00Z"}).json()
    assert at["interpolated"] is True
    assert abs(np.linalg.norm(at["sun_dir"]) - 1) < 1e-6


def test_compute_endpoints(client):
    r = client.post(f"{P}/compute/solar-disk-fraction", json={"sun_elevation_deg": 0, "horizon_elevation_deg": 0})
    assert abs(r.json()["visible_fraction"] - 0.5) < 1e-9
    h = client.post(f"{P}/compute/horizon-mask", json={"lat_deg": -89.8, "lon_deg": 0, "n_azimuths": 72}).json()
    assert len(h["elevations_deg"]) == 72
    sky = client.post(
        f"{P}/compute/sky-position",
        json={"lat_deg": 0, "lon_deg": 0, "time": "2028-01-01T00:00:00Z", "site_id": "connecting_ridge"},
    ).json()
    assert sky["sun_visible_disk_fraction"] == 0.0 and sky["lat_deg"] == -89.45
    assert sky["site_id"] == "connecting_ridge" and sky["state"] == "dark_no_link"
    raw_sky = client.post(
        f"{P}/compute/sky-position",
        json={"lat_deg": -89.5, "lon_deg": 0, "time": "2028-01-01T00:00:00Z"},
    ).json()
    assert raw_sky["site_id"] is None and raw_sky["state"] is None and raw_sky["next_sun_event"] is None
    bad = client.post(f"{P}/compute/horizon-mask", json={"lat_deg": -80, "lon_deg": 0})
    assert bad.status_code == 400


def test_site_sky_and_next_events(tmp_path):
    import json
    from fastapi.testclient import TestClient
    from conftest import N_AZ, START_UNIX, pack_ldem, pack_leph, pack_lhor, synthetic_ephemeris
    from lunarapi.config import Settings
    from lunarapi.main import create_app

    # Site at (-89.8, 0.0): Sun starts at az=0 deg and rotates 360 deg over 25 steps.
    # Place a 5 deg wall around azimuth 180 deg so the Sun sets mid-window and rises again later.
    mask = np.zeros(N_AZ)
    mask[N_AZ // 4 : 3 * N_AZ // 4] = 5.0
    (tmp_path / "horizons.lhor").write_bytes(pack_lhor([(-89.8, 0.0, 2.0, mask)], N_AZ))
    (tmp_path / "terrain.ldem").write_bytes(pack_ldem(np.zeros((16, 16)), 1.0))

    # Earth oscillates in elevation from +3 deg down to -5 deg so it sets after Earthset.
    sun, _, dist = synthetic_ephemeris(25)
    elat = np.radians(np.linspace(-3.0, 5.0, 25))
    earth = np.stack([np.cos(elat), np.zeros(25), np.sin(elat)], axis=1)
    (tmp_path / "ephemeris.leph").write_bytes(pack_leph(START_UNIX, 3600.0, sun, earth, dist))
    (tmp_path / "sites.json").write_text(json.dumps([{"id": "ridge_edge", "lat": -89.8, "lon": 0.0}]), encoding="utf-8")

    tc = TestClient(create_app(Settings(data_dir=tmp_path, sites_path=tmp_path / "sites.json")))
    default_sky = tc.get(f"{P}/sites/ridge_edge/sky").json()
    assert default_sky["site_id"] == "ridge_edge"
    assert default_sky["time_utc"] == "2028-01-01T00:00:00Z"
    assert default_sky["state"] == "sunlit_and_earth_link"
    assert default_sky["next_sun_event"]["type"] == "sunset"
    assert default_sky["next_sun_event"]["in_hours"] > 0
    assert default_sky["next_earth_event"]["type"] == "earthset"
    assert default_sky["next_earth_event"]["in_hours"] > 0

    mid_sky = tc.get(f"{P}/sites/ridge_edge/sky", params={"time": "2028-01-01T12:00:00Z"}).json()
    assert mid_sky["state"] == "dark_no_link"
    assert mid_sky["next_sun_event"]["type"] == "sunrise"
    assert tc.get(f"{P}/sites/ridge_edge/sky", params={"time": "2030-01-01T00:00:00Z"}).status_code == 400


def test_openapi_available(client):
    spec = client.get("/openapi.json").json()
    assert f"{P}/sites/{{site_id}}/illumination" in spec["paths"]
    assert f"{P}/sites/{{site_id}}/sky" in spec["paths"]
