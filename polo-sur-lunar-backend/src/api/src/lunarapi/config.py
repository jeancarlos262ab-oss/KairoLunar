"""Runtime configuration from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

_PKG_DIR = Path(__file__).resolve().parent
# .../src/api/src/lunarapi -> .../src (backend sources root containing pipeline/ and api/)
_BACKEND_SRC_DIR = _PKG_DIR.parents[2]


def _default_data_dir() -> Path:
    for candidate in (_BACKEND_SRC_DIR / "pipeline" / "output", Path.cwd() / "output"):
        if candidate.is_dir():
            return candidate
    return _BACKEND_SRC_DIR / "pipeline" / "output"


def _default_sites_path(data_dir: Path) -> Path | None:
    for var in ("LUNARAPI_SITES_PATH", "LUNARPIPE_SITES_PATH"):
        value = os.environ.get(var)
        if value:
            return Path(value)
    candidates = [data_dir / "sites.json"]
    candidates += [parent / "data" / "sites.json" for parent in _PKG_DIR.parents]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def _float_env(name: str, default: float) -> float:
    value = os.environ.get(name)
    return float(value) if value else default


@dataclass
class Settings:
    data_dir: Path
    sites_path: Path | None
    cors_origins: list[str] = field(default_factory=lambda: ["*"])
    solar_angular_radius_deg: float = 0.2666
    max_series_points: int = 100_000

    horizons_filename: str = "horizons.lhor"
    terrain_filename: str = "terrain.ldem"
    ephemeris_filename: str = "ephemeris.leph"

    @classmethod
    def from_env(cls) -> "Settings":
        data_dir = Path(os.environ["LUNARAPI_DATA_DIR"]) if os.environ.get("LUNARAPI_DATA_DIR") else _default_data_dir()
        origins = os.environ.get("LUNARAPI_CORS_ORIGINS", "*")
        return cls(
            data_dir=data_dir,
            sites_path=_default_sites_path(data_dir),
            cors_origins=[o.strip() for o in origins.split(",") if o.strip()],
            solar_angular_radius_deg=_float_env("LUNARAPI_SOLAR_RADIUS_DEG", 0.2666),
            max_series_points=int(_float_env("LUNARAPI_MAX_SERIES_POINTS", 100_000)),
        )
