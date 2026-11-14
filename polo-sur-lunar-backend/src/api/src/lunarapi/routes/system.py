"""Health, dataset inventory and raw binary downloads."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse

from lunarapi import __version__
from lunarapi.analysis import iso_utc
from lunarapi.deps import get_store
from lunarapi.schemas import DatasetInfo, DatasetsResponse, HealthResponse
from lunarapi.store import DataStore, DatasetUnavailableError

router = APIRouter(tags=["system"])

DatasetName = Literal["horizons", "terrain", "ephemeris"]


def _header(store: DataStore, name: str) -> dict:
    if name == "horizons":
        h = store.horizons()
        return {"magic": "LHOR", "version": h.version, "n_azimuths": h.n_azimuths, "n_sites": len(h.sites)}
    if name == "terrain":
        t = store.terrain()
        return {
            "magic": "LDEM",
            "version": t.version,
            "width": t.width,
            "height": t.height,
            "pixel_size_km": t.pixel_size_km,
            "z_min_m": t.z_min_m,
            "z_max_m": t.z_max_m,
        }
    e = store.ephemeris()
    return {
        "magic": "LEPH",
        "version": e.version,
        "n_samples": e.n_samples,
        "start_utc": iso_utc(e.start_unix_utc),
        "end_utc": iso_utc(e.end_unix_utc),
        "step_seconds": e.step_seconds,
    }


@router.get("/health", response_model=HealthResponse, summary="Service health and dataset availability")
def health(store: DataStore = Depends(get_store)) -> HealthResponse:
    status = {name: store.path_for(name).is_file() for name in store.DATASETS}
    return HealthResponse(
        status="ok" if all(status.values()) else "degraded",
        version=__version__,
        data_dir=str(store.settings.data_dir),
        datasets=status,
    )


@router.get("/datasets", response_model=DatasetsResponse, summary="Inventory of pipeline outputs")
def list_datasets(request: Request, store: DataStore = Depends(get_store)) -> DatasetsResponse:
    infos: list[DatasetInfo] = []
    for name in store.DATASETS:
        path = store.path_for(name)
        info = DatasetInfo(
            name=name,
            filename=path.name,
            available=False,
            raw_url=str(request.url_for("download_dataset", name=name).path),
        )
        if path.is_file():
            stat = path.stat()
            info.size_bytes = stat.st_size
            info.modified_utc = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
            try:
                info.header = _header(store, name)
                info.available = True
            except DatasetUnavailableError as exc:
                info.error = exc.reason
        else:
            info.error = "file not found"
        infos.append(info)
    sites_path = store.settings.sites_path
    return DatasetsResponse(
        data_dir=str(store.settings.data_dir),
        sites_catalog=str(sites_path) if sites_path and sites_path.is_file() else None,
        datasets=infos,
    )


@router.get(
    "/datasets/{name}/raw",
    name="download_dataset",
    summary="Download the original little-endian v1 binary file",
    response_class=FileResponse,
    responses={200: {"content": {"application/octet-stream": {}}}},
)
def download_dataset(name: DatasetName, store: DataStore = Depends(get_store)) -> FileResponse:
    path = store.path_for(name)
    if not path.is_file():
        raise DatasetUnavailableError(name, path, "file not found (run `python -m lunarpipe.build` first)")
    return FileResponse(path, media_type="application/octet-stream", filename=path.name)
