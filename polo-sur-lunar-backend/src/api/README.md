# Polo Sur Lunar — API REST (`lunarapi`)

API REST en Python (FastAPI) que expone a la aplicación web los resultados del backend:

- Los **archivos binarios del pipeline** (`horizons.lhor`, `terrain.ldem`, `ephemeris.leph`), ya decodificados a JSON o en formato binario listo para el cliente.
- Los **cálculos derivados**: posición del Sol y la Tierra vista desde cada sitio, fracción visible del disco solar con el modelo de segmento circular, visibilidad de la Tierra, estadísticas de iluminación y el cálculo de máscaras de horizonte bajo demanda. Usa los mismos algoritmos que `lunarpipe` y `horizon-wasm`.

La API solo **lee** los archivos generados por `python -m lunarpipe.build`. No ejecuta el pipeline ni necesita `rasterio`, SPICE ni Node.js.

## Instalación y ejecución

```bash
cd api
pip install -e ".[dev]"

# Opción 1: CLI
lunarapi --data-dir ../pipeline/output --sites ../../data/sites.json --port 8000

# Opción 2: uvicorn
LUNARAPI_DATA_DIR=../pipeline/output uvicorn lunarapi.main:create_app --factory --reload
```

- Documentación interactiva (Swagger): http://127.0.0.1:8000/docs
- Contrato OpenAPI, útil para generar el cliente TypeScript: http://127.0.0.1:8000/openapi.json

### Configuración (variables de entorno)

| Variable | Default | Descripción |
|---|---|---|
| `LUNARAPI_DATA_DIR` | `pipeline/output` (o `./output`) | Directorio con los 3 binarios |
| `LUNARAPI_SITES_PATH` / `LUNARPIPE_SITES_PATH` | `<data_dir>/sites.json` o `data/sites.json` | Catálogo de sitios (aporta `id`, `name` y metadatos) |
| `LUNARAPI_CORS_ORIGINS` | `*` | Orígenes permitidos, separados por comas |
| `LUNARAPI_SOLAR_RADIUS_DEG` | `0.2666` | Radio angular aparente del Sol |
| `LUNARAPI_MAX_SERIES_POINTS` | `100000` | Tope de puntos por serie temporal |

Los archivos se cargan de forma diferida y se guardan en caché. La caché se invalida sola si el archivo cambia (`mtime`/tamaño), así que basta con volver a ejecutar el pipeline para que la API sirva los datos nuevos sin reiniciarla.

## Endpoints (`/api/v1`)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado del servicio y disponibilidad de cada dataset |
| GET | `/datasets` | Inventario: tamaño, fecha y cabecera decodificada de cada binario |
| GET | `/datasets/{horizons\|terrain\|ephemeris}/raw` | Descarga del binario original v1 |
| GET | `/sites` | Lista de sitios: lat/lon, coordenadas estereográficas X/Y y estadísticas del horizonte |
| GET | `/sites/statistics?start&end&sort_by` | Ranking de sitios por iluminación y visibilidad de la Tierra |
| GET | `/sites/{id}` | Detalle del sitio, con su píxel en `terrain.ldem` (para `computeHorizonMask`) |
| GET | `/sites/{id}/horizon?frame=grid\|true` | Máscara de horizonte, respecto al norte de la rejilla o al norte verdadero |
| GET | `/sites/{id}/illumination?start&end&stride&max_points` | Serie temporal del Sol y la Tierra (azimut/elevación, horizonte, fracción visible del disco, visibilidad) más estadísticas |
| GET | `/sites/{id}/statistics?start&end` | Solo las estadísticas del sitio |
| GET | `/sites/{id}/sky?time` | Posición instantánea de Sol y Tierra, estado combinado (`state`) y próximos eventos (`sunrise`/`sunset`/`earthrise`/`earthset`) |
| GET | `/terrain` | Metadatos del terreno: dimensiones, resolución, límites y rango de elevación |
| GET | `/terrain/heights?encoding=json\|float32\|uint16&stride` | Rejilla de elevaciones |
| GET | `/terrain/elevation?lat&lon` | Elevación interpolada en un punto |
| GET | `/ephemeris` | Cobertura temporal de las efemérides |
| GET | `/ephemeris/samples?start&end&stride&max_points` | Vectores Sol/Tierra en `MOON_ME`, distancia y puntos subsolar/subterrestre |
| GET | `/ephemeris/at?time` | Efemérides interpoladas en un instante |
| POST | `/compute/solar-disk-fraction` | Fracción visible del disco solar |
| POST | `/compute/horizon-mask` | Máscara de horizonte para un punto arbitrario (sobre `terrain.ldem`) |
| POST | `/compute/sky-position` | Azimut/elevación del Sol y la Tierra desde un punto o sitio en un instante |

Detalles comunes:

- **Tiempos**: se aceptan en ISO-8601 (`2028-01-01T00:00:00Z`) o como segundos Unix.
- **Series largas**: se diezman automáticamente según `max_points`; el campo `window.stride` indica el paso que se aplicó. Las `statistics` siempre se calculan con todas las muestras del rango.
- **Formato de las series**: es columnar (un arreglo por variable), listo para usarse directamente en bibliotecas de gráficos.
- **Errores**: `404` si el sitio no existe, `400` si el rango o el punto están fuera de cobertura, `422` si falla la validación y `503` si falta un dataset o está corrupto. En este último caso la respuesta incluye el campo `dataset`.

### Uso con `horizon-wasm` en el cliente

```ts
const res = await fetch("/api/v1/terrain/heights?encoding=float32");
const width = Number(res.headers.get("X-Width"));
const height = Number(res.headers.get("X-Height"));
const resolutionM = Number(res.headers.get("X-Pixel-Size-Km")) * 1000;
const dem = new Float32Array(await res.arrayBuffer());

const site = await (await fetch("/api/v1/sites/shackleton_rim")).json();
const mask = computeHorizonMask(dem, width, height,
  site.terrain_pixel.row, site.terrain_pixel.col, resolutionM, 360, null, site.observer_height_m);
```

## Convenciones geométricas

- **Proyección**: estereográfica polar sur con radio esférico de `1 737 400 m`. El terreno está centrado en el polo; la fila 0 es el norte de la rejilla (`+y`) y las columnas crecen hacia el este de la rejilla (`+x`).
- **Azimuts en `horizons.lhor`**: están referidos al **norte de la rejilla**. En un sitio de longitud `λ`, el norte verdadero local tiene azimut de rejilla `λ`, es decir, `azimut_rejilla = (azimut_verdadero + λ) mod 360`. Los azimuts del Sol y la Tierra que devuelve la API están referidos al **norte verdadero local**, y la conversión se hace internamente al consultar la máscara.
- **Posición de la Tierra**: se corrige la paralaje topocéntrica (~1°). En el Sol es despreciable.
- **Visibilidad de la Tierra**: la Tierra se considera visible cuando la elevación de su centro supera la del horizonte.

## Pruebas

```bash
cd api
pytest
```

Las pruebas generan binarios sintéticos y no requieren DEM ni kernels. Si `lunarpipe` está instalado, también comprueban que los lectores son compatibles con los serializadores reales y que el trazado de rayos coincide con `lunarpipe.horizon`.
