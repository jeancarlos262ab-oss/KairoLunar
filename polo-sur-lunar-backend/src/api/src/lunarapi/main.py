"""FastAPI application factory and ``lunarapi`` CLI entrypoint."""

from __future__ import annotations

import argparse
import asyncio
import logging
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlsplit

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from lunarapi import __version__
from lunarapi.analysis import RangeError
from lunarapi.config import Settings
from lunarapi.routes import compute, ephemeris, sites, system, terrain
from lunarapi.store import DataStore, DatasetUnavailableError

API_PREFIX = "/api/v1"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    app = FastAPI(
        title="Polo Sur Lunar API",
        version=__version__,
        description=(
            "Serves the outputs of the `lunarpipe` pipeline (horizons.lhor, terrain.ldem, "
            "ephemeris.leph) and derived analyses (Sun/Earth visibility, illumination statistics) "
            "using the same algorithms as `lunarpipe` and `horizon-wasm`."
        ),
    )
    app.state.store = DataStore(settings)

    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["X-Width", "X-Height", "X-Stride", "X-Pixel-Size-Km", "X-Z-Min", "X-Z-Max", "X-Encoding"],
    )

    @app.exception_handler(DatasetUnavailableError)
    async def _dataset_unavailable(_: Request, exc: DatasetUnavailableError) -> JSONResponse:
        return JSONResponse(
            status_code=503,
            content={"detail": f"{exc.path.name}: {exc.reason}", "dataset": exc.dataset},
        )

    @app.exception_handler(RangeError)
    async def _range_error(_: Request, exc: RangeError) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    for module in (system, sites, terrain, ephemeris, compute):
        app.include_router(module.router, prefix=API_PREFIX)

    @app.get("/", include_in_schema=False)
    def _root() -> RedirectResponse:
        return RedirectResponse(url="/docs")

    return app


def _serve_asgi_stdlib(app: FastAPI, host: str, port: int) -> None:
    """Minimal stdlib ThreadingHTTPServer adapter for ASGI when uvicorn is absent."""
    log = logging.getLogger("lunarapi.server")

    class _Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
            log.info("%s - %s", self.address_string(), format % args)

        def _handle(self) -> None:
            length = int(self.headers.get("Content-Length") or 0)
            req_body = self.rfile.read(length) if length > 0 else b""
            parts = urlsplit(self.path)
            raw_path = parts.path.encode("latin-1")
            scope = {
                "type": "http",
                "asgi": {"version": "3.0", "spec_version": "2.3"},
                "http_version": "1.1",
                "method": self.command,
                "scheme": "http",
                "path": unquote(parts.path),
                "raw_path": raw_path,
                "query_string": parts.query.encode("latin-1"),
                "root_path": "",
                "headers": [
                    (k.lower().encode("latin-1"), v.encode("latin-1"))
                    for k, v in self.headers.items()
                ],
                "client": self.client_address,
                "server": (host, port),
            }

            status = 500
            resp_headers: list[tuple[bytes, bytes]] = []
            chunks: list[bytes] = []
            delivered = False

            async def receive() -> dict[str, Any]:
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {"type": "http.request", "body": req_body, "more_body": False}
                return {"type": "http.disconnect"}

            async def send(message: dict[str, Any]) -> None:
                nonlocal status, resp_headers
                if message["type"] == "http.response.start":
                    status = int(message["status"])
                    resp_headers = list(message.get("headers", []))
                elif message["type"] == "http.response.body":
                    body = message.get("body", b"")
                    if body:
                        chunks.append(body)

            asyncio.run(app(scope, receive, send))
            payload = b"".join(chunks)

            self.send_response(status)
            has_len = False
            for k, v in resp_headers:
                kl = k.decode("latin-1").lower()
                if kl in ("transfer-encoding", "connection"):
                    continue
                if kl == "content-length":
                    has_len = True
                self.send_header(k.decode("latin-1"), v.decode("latin-1"))
            if not has_len:
                self.send_header("Content-Length", str(len(payload)))
            self.send_header("Connection", "close")
            self.end_headers()
            if self.command != "HEAD" and payload:
                self.wfile.write(payload)

        do_GET = do_POST = do_OPTIONS = do_HEAD = do_PUT = do_DELETE = do_PATCH = _handle

    class _ReusableServer(ThreadingHTTPServer):
        allow_reuse_address = True

    server = _ReusableServer((host, port), _Handler)
    log.info("Serving Polo Sur Lunar API on http://%s:%d (stdlib HTTP fallback)", host, port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def run(argv: list[str] | None = None) -> None:
    import os

    parser = argparse.ArgumentParser(prog="lunarapi", description="Run the Polo Sur Lunar REST API.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--data-dir", type=Path, help="Directory with horizons.lhor, terrain.ldem, ephemeris.leph.")
    parser.add_argument("--sites", type=Path, help="Optional site catalog JSON (ids/names).")
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args(argv)

    if args.data_dir:
        os.environ["LUNARAPI_DATA_DIR"] = str(args.data_dir.resolve())
    if args.sites:
        os.environ["LUNARAPI_SITES_PATH"] = str(args.sites.resolve())

    logging.basicConfig(level=logging.INFO)
    try:
        import uvicorn
    except ImportError:
        if args.reload:
            logging.warning("--reload requires uvicorn; starting without auto-reload.")
        _serve_asgi_stdlib(create_app(), args.host, args.port)
        return

    uvicorn.run("lunarapi.main:create_app", factory=True, host=args.host, port=args.port, reload=args.reload)


if __name__ == "__main__":
    run()
