"""Thread-safe, mtime-aware cache of the pipeline output files."""

from __future__ import annotations

import json
import logging
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Generic, TypeVar

import numpy as np

from lunarapi.config import Settings
from lunarapi.readers import (
    EphemerisFile,
    HorizonsFile,
    TerrainFile,
    read_ldem,
    read_leph,
    read_lhor,
)

log = logging.getLogger(__name__)
T = TypeVar("T")

# float32 storage in LHOR -> compare catalog coordinates with a loose tolerance.
_COORD_TOL_DEG = 1e-3


class DatasetUnavailableError(Exception):
    """The requested pipeline output does not exist or cannot be parsed."""

    def __init__(self, dataset: str, path: Path, reason: str) -> None:
        super().__init__(f"Dataset '{dataset}' unavailable at {path}: {reason}")
        self.dataset = dataset
        self.path = path
        self.reason = reason


@dataclass
class _CacheEntry(Generic[T]):
    key: tuple[int, int]
    value: T


@dataclass(frozen=True)
class Site:
    """A site combining its LHOR horizon record with optional catalog metadata."""

    id: str
    index: int
    lat_deg: float
    lon_deg: float
    observer_height_m: float
    horizon_grid_deg: np.ndarray
    name: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class DataStore:
    DATASETS = ("horizons", "terrain", "ephemeris")

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._lock = threading.RLock()
        self._cache: dict[str, _CacheEntry[Any]] = {}

    # ------------------------------------------------------------------ paths
    def path_for(self, dataset: str) -> Path:
        s = self.settings
        names = {
            "horizons": s.horizons_filename,
            "terrain": s.terrain_filename,
            "ephemeris": s.ephemeris_filename,
        }
        if dataset not in names:
            raise KeyError(dataset)
        return s.data_dir / names[dataset]

    # ------------------------------------------------------------------ loading
    def _load(self, name: str, path: Path, loader: Callable[[Path], T]) -> T:
        try:
            stat = path.stat()
        except FileNotFoundError:
            raise DatasetUnavailableError(
                name, path, "file not found (run `python -m lunarpipe.build` first)"
            ) from None
        key = (stat.st_mtime_ns, stat.st_size)
        with self._lock:
            entry = self._cache.get(name)
            if entry is not None and entry.key == key:
                return entry.value
            try:
                value = loader(path)
            except Exception as exc:  # noqa: BLE001 - surfaced as 503
                raise DatasetUnavailableError(name, path, str(exc)) from exc
            self._cache[name] = _CacheEntry(key=key, value=value)
            log.info("Loaded %s from %s", name, path)
            return value

    def horizons(self) -> HorizonsFile:
        return self._load("horizons", self.path_for("horizons"), read_lhor)

    def terrain(self) -> TerrainFile:
        return self._load("terrain", self.path_for("terrain"), read_ldem)

    def terrain_heights(self) -> np.ndarray:
        terrain = self.terrain()
        return self._load("terrain_heights", self.path_for("terrain"), lambda _p: terrain.heights_m)

    def ephemeris(self) -> EphemerisFile:
        return self._load("ephemeris", self.path_for("ephemeris"), read_leph)

    # ------------------------------------------------------------------ sites
    def _catalog(self) -> list[dict[str, Any]] | None:
        path = self.settings.sites_path
        if path is None or not path.is_file():
            return None

        def load(p: Path) -> list[dict[str, Any]] | None:
            raw = json.loads(p.read_text(encoding="utf-8"))
            return raw if isinstance(raw, list) else None

        try:
            return self._load("catalog", path, load)
        except DatasetUnavailableError as exc:
            log.warning("Ignoring site catalog: %s", exc)
            return None

    def sites(self) -> list[Site]:
        horizons = self.horizons()
        catalog = self._catalog()
        use_catalog = catalog is not None and len(catalog) == len(horizons.sites)
        if use_catalog:
            for rec, item in zip(horizons.sites, catalog):  # type: ignore[arg-type]
                if not isinstance(item, dict):
                    use_catalog = False
                    break
                try:
                    if (
                        abs(float(item["lat"]) - rec.lat_deg) > _COORD_TOL_DEG
                        or abs(float(item["lon"]) - rec.lon_deg) > _COORD_TOL_DEG
                    ):
                        use_catalog = False
                        break
                except (KeyError, TypeError, ValueError):
                    use_catalog = False
                    break

        result: list[Site] = []
        for rec in horizons.sites:
            item = catalog[rec.index] if use_catalog else {}  # type: ignore[index]
            site_id = str(item.get("id", "")).strip() or f"site-{rec.index}"
            extra = {k: v for k, v in item.items() if k not in ("id", "lat", "lon", "name")}
            # Prefer exact catalog coordinates over the float32 values stored in LHOR.
            result.append(
                Site(
                    id=site_id,
                    index=rec.index,
                    lat_deg=float(item["lat"]) if use_catalog else rec.lat_deg,
                    lon_deg=float(item["lon"]) if use_catalog else rec.lon_deg,
                    observer_height_m=rec.observer_height_m,
                    horizon_grid_deg=rec.elevations_deg,
                    name=item.get("name") if isinstance(item.get("name"), str) else None,
                    metadata=extra,
                )
            )
        return result

    def site(self, site_id: str) -> Site | None:
        for s in self.sites():
            if s.id == site_id or f"site-{s.index}" == site_id:
                return s
        return None
