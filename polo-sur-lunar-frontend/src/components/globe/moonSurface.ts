/**
 * Superficie lunar procedural para la vista del polo sur.
 *
 * - El relieve (cráteres + terreno) es ilustrativo: no son datos topográficos reales.
 * - La iluminación SÍ es real: depende del vector del Sol de la fecha elegida y de la máscara de horizonte,
 *   así que el terminador (línea día/noche) coincide con el cálculo del resto de la app.
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export interface Terrain {
  readonly n: number;
  readonly albedo: Float32Array;
  /** Gradiente del relieve (por píxel) para el sombreado. */
  readonly gx: Float32Array;
  readonly gy: Float32Array;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, seed: number, oct: number): number {
  let amp = 0.5;
  let f = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(x * f, y * f, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

interface TerrainOpts {
  readonly n: number;
  readonly craters: number;
  readonly rMin: number;
  readonly rMax: number;
  readonly noiseScale: number;
  readonly seed: number;
}

export function buildTerrain(o: TerrainOpts): Terrain {
  const { n } = o;
  const h = new Float32Array(n * n);
  const albedo = new Float32Array(n * n);
  const rnd = mulberry32(o.seed);

  // terreno base: tierras altas claras y mares oscuros de gran escala
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const u = ((i + 0.5) / n) * 2 - 1;
      const v = ((j + 0.5) / n) * 2 - 1;
      const big = fbm(u * o.noiseScale, v * o.noiseScale, o.seed, 5);
      const fine = fbm(u * o.noiseScale * 6, v * o.noiseScale * 6, o.seed + 91, 4);
      h[j * n + i] = (big - 0.5) * 0.045 + (fine - 0.5) * 0.008;
      const mare = Math.min(1, Math.max(0, (0.47 - big) * 5));
      albedo[j * n + i] = 0.5 + (fine - 0.5) * 0.28 - mare * 0.24;
    }
  }

  // cráteres (distribución de potencias: pocos grandes, muchos pequeños)
  const list: Array<{ x: number; y: number; r: number }> = [];
  for (let k = 0; k < o.craters; k++) {
    const r = o.rMin * Math.pow(o.rMax / o.rMin, Math.pow(rnd(), 2.2));
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * 1.05;
    list.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r });
  }
  list.sort((p, q) => q.r - p.r);
  for (const c of list) {
    const px = ((c.x + 1) / 2) * n;
    const py = ((c.y + 1) / 2) * n;
    const pr = (c.r / 2) * n * 1.35;
    const i0 = Math.max(0, Math.floor(px - pr));
    const i1 = Math.min(n - 1, Math.ceil(px + pr));
    const j0 = Math.max(0, Math.floor(py - pr));
    const j1 = Math.min(n - 1, Math.ceil(py + pr));
    const depth = 0.3 * c.r * (c.r > 0.05 ? 0.85 : 1);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const u = ((i + 0.5) / n) * 2 - 1;
        const v = ((j + 0.5) / n) * 2 - 1;
        const d = Math.hypot(u - c.x, v - c.y) / c.r;
        if (d > 1.35) continue;
        let dh = 0;
        let da = 0;
        if (d < 1) {
          const bowl = 1 - d * d;
          dh = -depth * bowl * (c.r > 0.06 ? Math.min(1, 0.4 + bowl * 1.2) : 1);
          da = -0.07 * bowl;
        }
        const rim = Math.exp(-(((d - 1.02) / 0.13) ** 2));
        dh += depth * 0.35 * rim;
        da += 0.1 * rim;
        const idx = j * n + i;
        h[idx] = (h[idx] ?? 0) + dh;
        albedo[idx] = (albedo[idx] ?? 0.6) + da;
      }
    }
  }

  // gradiente del relieve (diferencias centrales), escalado a "pendiente por píxel"
  const gx = new Float32Array(n * n);
  const gy = new Float32Array(n * n);
  const px = 2 / n;
  for (let j = 1; j < n - 1; j++) {
    for (let i = 1; i < n - 1; i++) {
      const idx = j * n + i;
      gx[idx] = ((h[idx + 1] ?? 0) - (h[idx - 1] ?? 0)) / (2 * px);
      gy[idx] = ((h[idx + n] ?? 0) - (h[idx - n] ?? 0)) / (2 * px);
    }
  }
  return { n, albedo, gx, gy };
}

let capTerrain: Terrain | undefined;
let globeTerrain: Terrain | undefined;

export function capTerrainData(): Terrain {
  capTerrain ??= buildTerrain({ n: 512, craters: 340, rMin: 0.01, rMax: 0.085, noiseScale: 2.4, seed: 7 });
  return capTerrain;
}

export function globeTerrainData(): Terrain {
  globeTerrain ??= buildTerrain({ n: 220, craters: 110, rMin: 0.03, rMax: 0.16, noiseScale: 1.6, seed: 23 });
  return globeTerrain;
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function makeCanvas(n: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = n;
  c.height = n;
  return c;
}

export interface Rendered {
  readonly canvas: HTMLCanvasElement;
  key: string;
}

/**
 * Casquete polar de `capDeg` grados, visto desde arriba del polo sur (mismo mapeo que los sitios:
 * x = k·sinθ·sinλ, y = −k·sinθ·cosλ). Devuelve un canvas cuadrado donde el disco ocupa todo el ancho.
 */
export function renderCap(
  out: Rendered | undefined,
  sun: readonly number[] | undefined,
  thrDeg: number,
  capDeg: number,
  mode: "ortho" | "equi" = "ortho",
): Rendered {
  const t = capTerrainData();
  const n = t.n;
  const key = `${sun ? sun.map((v) => v.toFixed(4)).join(",") : "none"}|${thrDeg.toFixed(2)}|${capDeg}|${mode}`;
  const r: Rendered = out ?? { canvas: makeCanvas(n), key: "" };
  if (r.key === key) return r;
  r.key = key;

  const ctx = r.canvas.getContext("2d");
  if (!ctx) return r;
  const img = ctx.createImageData(n, n);
  const d = img.data;
  const sinCap = Math.sin(capDeg * DEG);
  const sx = sun?.[0] ?? 0;
  const sy = sun?.[1] ?? 0;
  const sz = sun?.[2] ?? 0;
  // dirección del Sol en la imagen (x ↔ ny, y hacia abajo ↔ −nx)
  const hm = Math.hypot(sx, sy) || 1;
  const sdx = sy / hm;
  const sdy = -sx / hm;

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const u = ((i + 0.5) / n) * 2 - 1;
      const v = ((j + 0.5) / n) * 2 - 1;
      const rr = u * u + v * v;
      const o = (j * n + i) * 4;
      if (rr > 1) {
        d[o + 3] = 0;
        continue;
      }
      let nx: number;
      let ny: number;
      let nz: number;
      if (mode === "equi") {
        // proyección equidistante: radio ∝ colatitud
        const rad = Math.sqrt(rr) || 1e-9;
        const th = rad * capDeg * DEG;
        nx = (-v / rad) * Math.sin(th);
        ny = (u / rad) * Math.sin(th);
        nz = -Math.cos(th);
      } else {
        nx = -v * sinCap;
        ny = u * sinCap;
        nz = -Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      }
      const idx = j * n + i;
      const alb = Math.min(1, Math.max(0.12, t.albedo[idx] ?? 0.6));

      let lit = 0;
      if (sun) {
        const dot = Math.max(-1, Math.min(1, nx * sx + ny * sy + nz * sz));
        const above = Math.asin(dot) * RAD - thrDeg;
        lit = smooth(0, 2.2, above);
      }
      const slope = (t.gx[idx] ?? 0) * sdx + (t.gy[idx] ?? 0) * sdy;
      const relief = Math.max(-0.5, Math.min(0.5, -slope * 5));
      const dayB = alb * (0.34 + 0.66 * lit) * (1 + relief * (0.35 + 0.65 * lit));
      // lado nocturno: casi negro con un leve tono azul (luz de la Tierra)
      const nightB = 0.035 + alb * 0.05 * (1 + relief * 0.5);
      const b = lit > 0 ? Math.max(nightB, dayB * (0.25 + 0.75 * lit) + nightB * (1 - lit)) : nightB;
      const edge = 1 - smooth(0.965, 1, Math.sqrt(rr));
      d[o] = Math.min(255, b * 218 + (1 - lit) * 4);
      d[o + 1] = Math.min(255, b * 214 + (1 - lit) * 7);
      d[o + 2] = Math.min(255, b * 206 + (1 - lit) * 16);
      d[o + 3] = 255 * edge;
    }
  }
  ctx.putImageData(img, 0, 0);
  return r;
}

/** Luna completa vista desde el polo sur (esfera ortográfica) con el día/noche reales. */
export function renderGlobe(out: Rendered | undefined, sun: readonly number[] | undefined): Rendered {
  const t = globeTerrainData();
  const n = t.n;
  const key = sun ? sun.map((v) => v.toFixed(3)).join(",") : "none";
  const r: Rendered = out ?? { canvas: makeCanvas(n), key: "" };
  if (r.key === key) return r;
  r.key = key;
  const ctx = r.canvas.getContext("2d");
  if (!ctx) return r;
  const img = ctx.createImageData(n, n);
  const d = img.data;
  const sx = sun?.[0] ?? 0;
  const sy = sun?.[1] ?? 0;
  const sz = sun?.[2] ?? 0;
  const hm = Math.hypot(sx, sy) || 1;
  const sdx = sy / hm;
  const sdy = -sx / hm;

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const u = ((i + 0.5) / n) * 2 - 1;
      const v = ((j + 0.5) / n) * 2 - 1;
      const rr = Math.sqrt(u * u + v * v);
      const o = (j * n + i) * 4;
      if (rr > 1) {
        d[o + 3] = 0;
        continue;
      }
      const nx = -v;
      const ny = u;
      const nz = -Math.sqrt(Math.max(0, 1 - rr * rr));
      const idx = j * n + i;
      const alb = Math.min(1, Math.max(0.15, t.albedo[idx] ?? 0.6));
      const dot = sun ? nx * sx + ny * sy + nz * sz : 0;
      const lam = Math.max(0, dot);
      const slope = (t.gx[idx] ?? 0) * sdx + (t.gy[idx] ?? 0) * sdy;
      const relief = Math.max(-0.6, Math.min(0.6, -slope * 5));
      const limb = 0.55 + 0.45 * Math.sqrt(Math.max(0, 1 - rr * rr));
      const day = alb * Math.pow(lam, 0.65) * (1 + relief * 0.5) * limb * 1.15;
      const night = 0.03 + alb * 0.035;
      const b = Math.max(night, day);
      const edge = 1 - smooth(0.975, 1, rr);
      d[o] = Math.min(255, b * 252);
      d[o + 1] = Math.min(255, b * 248);
      d[o + 2] = Math.min(255, b * 240 + (1 - lam) * 10);
      d[o + 3] = 255 * edge;
    }
  }
  ctx.putImageData(img, 0, 0);
  return r;
}

const dataUrlCache = new Map<string, Rendered>();
let lastUrl = { key: "", url: "" };

/** Casquete como data URL (para usarlo dentro de un <image> SVG). */
export function capDataUrl(sun: readonly number[] | undefined, thrDeg: number, capDeg: number, mode: "ortho" | "equi"): string {
  const ck = `${capDeg}|${mode}`;
  const r = renderCap(dataUrlCache.get(ck), sun, thrDeg, capDeg, mode);
  dataUrlCache.set(ck, r);
  const k = `${ck}|${r.key}`;
  if (lastUrl.key !== k) lastUrl = { key: k, url: r.canvas.toDataURL("image/png") };
  return lastUrl.url;
}
