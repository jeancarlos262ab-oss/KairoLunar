# Polo Sur Lunar — Backend de Datos y Cómputo

Conjunto de herramientas de generación de datos y cómputo para la planificación de sitios en el polo sur lunar. Este directorio **no** contiene un servidor web ni una aplicación cliente: produce archivos binarios estáticos y una biblioteca de cómputo geométrico reutilizable en nativo o WebAssembly.

## Estructura de subdirectorios

- **`pipeline/`**: Paquete Python (`lunarpipe`) encargado de leer un DEM GeoTIFF en proyección estereográfica polar sur, validar el catálogo de sitios, calcular máscaras de horizonte por trazado de rayos, recortar y submuestrear el terreno, descargar/cargar kernels NAIF SPICE para obtener efemérides Sol/Tierra en el marco `MOON_ME`, y exportar los archivos binarios versión 1.
- **`horizon-wasm/`**: Biblioteca TypeScript (`@polo-sur-lunar/horizon`) que implementa el cálculo de máscaras de horizonte (`computeHorizonMask`) sobre un DEM `Float32Array` *row-major* y la fracción visible del disco solar (`solarDiskFraction`) mediante el modelo de segmento circular, lista para ejecutarse tanto en Node.js (`>= 22.6`) como en aplicaciones cliente web/TypeScript sin necesidad de compilar Rust/C++.

## Flujo de datos

```text
DEM LOLA (GeoTIFF, m) + Catálogo de sitios (JSON) + Kernels NAIF/SPICE
        │
        ▼  python -m lunarpipe.build
  ┌────────────────────────────────────────────┐
  │  horizons.lhor  (máscaras de horizonte)    │
  │  terrain.ldem   (terreno submuestreado)    │
  │  ephemeris.leph (efemérides MOON_ME)       │
  └────────────────────────────────────────────┘
        │
        ▼
  Lectura manual desde una aplicación cliente
```

> **Nota importante:** Los archivos generados (`horizons.lhor`, `terrain.ldem`, `ephemeris.leph`) permanecen en el directorio de salida especificado (`--output-dir`) y **no se copian automáticamente** a ninguna aplicación cliente.

## Formatos binarios (little-endian, versión 1)

Todos los archivos usan empaquetado binario explícito en orden little-endian, sin alineación implícita de structs nativos.

### `horizons.lhor` (LHOR)

- **Cabecera (16 bytes)**:
  - `[0..4)` ASCII `"LHOR"`
  - `[4..6)` `u16`: versión (`1`)
  - `[6..8)` `u16`: número de azimuts (`n_az`)
  - `[8..12)` `u32`: número de sitios (`n_sites`)
  - `[12..16)` `u32`: reservado (`0`)
- **Registro por sitio (`12 + 2 * n_az` bytes)**:
  - `f32`: latitud en grados
  - `f32`: longitud en grados
  - `f32`: altura del observador sobre el terreno en metros
  - `int16[n_az]`: elevación angular del horizonte en centésimas de grado, redondeada y saturada al rango `[-32768, 32767]`. Todos los sitios comparten `n_az`.

### `ephemeris.leph` (LEPH)

- **Cabecera (32 bytes)**:
  - `[0..4)` ASCII `"LEPH"`
  - `[4..6)` `u16`: versión (`1`)
  - `[6..8)` `u16`: reservado (`0`)
  - `[8..12)` `u32`: número de muestras (`n_samples`)
  - `[12..20)` `f64`: tiempo inicial Unix en segundos UTC
  - `[20..24)` `f32`: paso temporal en segundos
  - `[24..32)` 8 bytes de relleno a cero (para completar la cabecera fija de 32 bytes sin alineación implícita)
- **Registro por muestra (28 bytes)**:
  - `3 × f32`: vector unitario Luna → Sol en marco `MOON_ME` (corrección `LT+S`)
  - `3 × f32`: vector unitario Luna → Tierra en marco `MOON_ME` (corrección `LT+S`)
  - `1 × f32`: distancia Tierra–Luna en kilómetros

### `terrain.ldem` (LDEM)

- **Cabecera (32 bytes)**:
  - `[0..4)` ASCII `"LDEM"`
  - `[4..6)` `u16`: versión (`1`)
  - `[6..8)` `u16`: reservado (`0`)
  - `[8..10)` `u16`: ancho (`width`)
  - `[10..12)` `u16`: alto (`height`)
  - `[12..16)` `f32`: tamaño de píxel en kilómetros
  - `[16..20)` `f32`: elevación mínima `z_min` en metros
  - `[20..24)` `f32`: elevación máxima `z_max` en metros
  - `[24..32)` 8 bytes de relleno a cero
- **Datos (`2 × width × height` bytes)**:
  - `uint16` en orden por filas (*row-major*, la fila `0` representa el norte), normalizados de `[z_min, z_max]` a `[0, 65535]`. Si todas las elevaciones son iguales (`z_min == z_max`), todas las muestras se escriben como `0`.

## Dependencias

### Pipeline Python (`pipeline/`)

- Python `>= 3.10`
- Base: `numpy >= 1.26`, `spiceypy >= 6.0`, `rasterio >= 1.3`
- Opcionales:
  - `numba >= 0.59` (aceleración JIT del trazado de rayos; el pipeline funciona con respaldo puro Python/NumPy si no está instalado)
  - `pytest >= 8` (pruebas unitarias)

### Biblioteca de horizonte en TypeScript (`horizon-wasm/`)

- Node.js `>= 22.6` (para ejecución nativa de `.ts` con `node --test`) o cualquier entorno bundler/navegador compatible con ES2022.
- Sin dependencias de tiempo de ejecución en producción (`computeHorizonMask`, `bilinearInterpolate`, `solarDiskFraction`).
- Compilador TypeScript local (`scripts/build.mjs`) para verificación estricta de tipos y emisión a `dist/` (usa `typescript` de `node_modules` o el integrado en VS Code / Antigravity IDE).

## Instalación y ejecución

### Instalación editable del pipeline Python

```bash
cd pipeline
pip install -e ".[dev]"
```

(Para instalar sin `numba` ni herramientas de prueba, use `pip install -e .`.)

### Ejecución del pipeline CLI

El catálogo de sitios debe ser un array JSON no vacío con objetos que contengan al menos `id`, `lat` y `lon` (en grados):

```json
[
  {"id": "shackleton_rim", "lat": -89.8, "lon": 0.0},
  {"id": "connecting_ridge", "lat": -89.45, "lon": 222.5}
]
```

Ejemplo de ejecución:

```bash
python -m lunarpipe.build \
  --dem /ruta/a/lola_south_pole.tif \
  --sites /ruta/a/sites.json \
  --output-dir ./output \
  --kernels-dir ./kernels \
  --start-utc 2028-01-01T00:00:00Z \
  --duration-days 365 \
  --step-seconds 3600 \
  --observer-height 2.0 \
  --terrain-extent-km 160 \
  --n-azimuths 360
```

La ruta por defecto de `--sites` puede configurarse con la variable de entorno `LUNARPIPE_SITES_PATH` o ubicando `data/sites.json` en la raíz del proyecto.

### Pruebas automatizadas

Pipeline Python (sin requerir DEM ni kernels SPICE reales):

```bash
cd pipeline
pytest
```

Biblioteca TypeScript (verificación de tipos, compilación a `dist/` y pruebas unitarias):

```powershell
cd horizon-wasm
./run-tests.ps1
```

O manualmente si `node` y `typescript` están en tu `PATH`:

```bash
cd horizon-wasm
npm run build
npm test
```

## Limitaciones conocidas

1. **Kernels NAIF SPICE obligatorios para efemérides**: El cálculo de `ephemeris.leph` requiere los 5 kernels oficiales (`naif0012.tls`, `pck00011.tpc`, `de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_220930.tf`). Si no existen en `--kernels-dir`, el pipeline intenta descargarlos desde NAIF; si la descarga o la carga fallan (o se pasa `--no-download-kernels`), el proceso falla con código distinto de cero y **nunca** sustituye los resultados reales por datos simulados.
2. **Sin copia automática al cliente**: Los archivos generados permanecen en `--output-dir` y deben ser copiados o enlazados explícitamente hacia la aplicación cliente.
3. **Geometría del DEM**: Solo se admiten rasters GeoTIFF norte-arriba (`a > 0`, `e < 0`), sin rotación ni cizalladura, y con píxeles cuadrados. El trazado de rayos de máscara de horizonte exige valores finitos en el DEM de entrada (sin celdas `NaN`).
4. **Proyección esférica**: La conversión estereográfica polar sur y la corrección de curvatura usan un radio lunar esférico fijo de `1_737_400 m`.
