"""NAIF/SPICE kernel verification and atomic download management."""

from __future__ import annotations

import shutil
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

NAIF_GENERIC_KERNELS_BASE_URL = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/"


@dataclass(frozen=True)
class KernelSpec:
    """Metadata describing a required NAIF SPICE kernel file."""

    filename: str
    relative_url: str
    kind: str


REQUIRED_KERNELS: tuple[KernelSpec, ...] = (
    KernelSpec("naif0012.tls", "lsk/naif0012.tls", "LSK"),
    KernelSpec("pck00011.tpc", "pck/pck00011.tpc", "PCK"),
    KernelSpec("moon_de440_220930.tf", "fk/satellites/moon_de440_220930.tf", "FK"),
    KernelSpec("moon_pa_de440_200625.bpc", "pck/moon_pa_de440_200625.bpc", "BPC"),
    KernelSpec("de440s.bsp", "spk/planets/de440s.bsp", "SPK"),
)


def _download_atomic(url: str, dest: Path, timeout_s: float) -> None:
    """Download ``url`` to a temporary ``.part`` file and atomically rename on completion."""
    part_path = dest.with_name(dest.name + ".part")
    part_path.unlink(missing_ok=True)

    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "lunarpipe/0.1 (+NAIF SPICE kernel fetcher)"},
        )
        with urllib.request.urlopen(req, timeout=timeout_s) as response:
            status = getattr(response, "status", 200)
            if status is not None and status >= 400:
                raise RuntimeError(f"HTTP {status} while downloading {url}")

            content_length_hdr = response.headers.get("Content-Length") if response.headers else None
            expected_size = int(content_length_hdr) if content_length_hdr and content_length_hdr.isdigit() else None

            bytes_written = 0
            with part_path.open("wb") as fh:
                while True:
                    chunk = response.read(65536)
                    if not chunk:
                        break
                    fh.write(chunk)
                    bytes_written += len(chunk)

        if bytes_written == 0:
            raise RuntimeError(f"Downloaded kernel from {url} is empty (0 bytes).")
        if expected_size is not None and bytes_written != expected_size:
            raise RuntimeError(
                f"Incomplete download for {dest.name}: received {bytes_written} bytes, "
                f"expected {expected_size} bytes."
            )

        part_path.replace(dest)
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, ValueError) as exc:
        part_path.unlink(missing_ok=True)
        raise RuntimeError(f"Failed to download SPICE kernel {dest.name} from {url}: {exc}") from exc
    except Exception:
        part_path.unlink(missing_ok=True)
        raise


def ensure_kernels(
    kernel_dir: str | Path,
    download: bool = True,
    base_url: str = NAIF_GENERIC_KERNELS_BASE_URL,
    timeout_s: float = 120.0,
) -> list[Path]:
    """Ensure all required NAIF SPICE kernels exist locally, downloading missing ones if allowed.

    Already-present non-empty kernel files are reused without re-downloading. Incomplete
    downloads use a temporary ``.part`` file that is deleted on any error.

    Args:
        kernel_dir: Directory where kernels are stored.
        download: If ``True``, download missing kernels from ``base_url``. If ``False``,
            raise :class:`FileNotFoundError` when any required kernel is missing or empty.
        base_url: Root URL hosting NAIF generic kernels.
        timeout_s: Network timeout per file in seconds.

    Returns:
        Ordered list of resolved local kernel :class:`pathlib.Path` objects ready for ``furnsh``.

    Raises:
        FileNotFoundError: If ``download=False`` and a required kernel is missing or empty.
        RuntimeError: If a network or filesystem error prevents obtaining a valid kernel.
    """
    target_dir = Path(kernel_dir)
    if download:
        target_dir.mkdir(parents=True, exist_ok=True)
    elif not target_dir.is_dir():
        raise FileNotFoundError(f"Kernel directory does not exist: {target_dir}")

    base = base_url.rstrip("/") + "/"
    resolved: list[Path] = []

    for spec in REQUIRED_KERNELS:
        dest = target_dir / spec.filename
        if dest.is_file() and dest.stat().st_size > 0:
            resolved.append(dest)
            continue

        if dest.exists() and dest.stat().st_size == 0:
            if not download:
                raise FileNotFoundError(
                    f"Required SPICE kernel {dest} exists but is empty (0 bytes)."
                )
            dest.unlink()

        if not download:
            raise FileNotFoundError(
                f"Missing required SPICE kernel {dest}. "
                "Enable downloading or provide the NAIF kernel file."
            )

        url = base + spec.relative_url.lstrip("/")
        _download_atomic(url, dest, timeout_s=timeout_s)
        resolved.append(dest)

    return resolved


def stage_local_kernels(source_dir: str | Path, dest_dir: str | Path) -> list[Path]:
    """Copy already-validated kernels from ``source_dir`` to ``dest_dir`` cleanly."""
    src = Path(source_dir)
    dst = Path(dest_dir)
    dst.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for spec in REQUIRED_KERNELS:
        src_file = src / spec.filename
        if not src_file.is_file() or src_file.stat().st_size == 0:
            raise FileNotFoundError(f"Missing or empty source kernel: {src_file}")
        dst_file = dst / spec.filename
        if not (dst_file.is_file() and dst_file.stat().st_size > 0):
            tmp = dst_file.with_name(dst_file.name + ".part")
            try:
                shutil.copyfile(src_file, tmp)
                tmp.replace(dst_file)
            except Exception:
                tmp.unlink(missing_ok=True)
                raise
        paths.append(dst_file)
    return paths
