export interface TerrainPatch {
  size: number;
  extentM: number;
  stepM: number;
  siteHeightM: number;
  minM: number;
  maxM: number;
  heights: Float32Array;
}

export interface HorizonProfile {
  elevationDeg: (number | null)[];
  stepDeg: number;
  observerHeightM: number;
  maxRadiusM: number;
  minReachKm: number;
}

export interface SiteData {
  terrain: TerrainPatch | null;
  horizon: HorizonProfile | null;
}

interface ManifestSite {
  id: string;
  terrain?: {
    file: string;
    size: number;
    extent_m: number;
    step_m: number;
    site_height_m: number;
    min_m: number;
    max_m: number;
  };
  horizon?: {
    file: string;
  };
}

interface Manifest {
  sites: ManifestSite[];
}

interface HorizonFile {
  elevation_deg: (number | null)[];
  azimuth_step_deg: number;
  observer_height_m: number;
  max_radius_m: number;
  min_reach_km: number;
}

const DATA_ROOT = 'data/';

let manifestPromise: Promise<Manifest | null> | null = null;
const siteCache = new Map<string, Promise<SiteData>>();

async function fetchOk(path: string): Promise<Response> {
  const response = await fetch(`${DATA_ROOT}${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response;
}

export function parseTerrain(buffer: ArrayBuffer, size: number): Float32Array {
  const expected = size * size * 4;
  if (buffer.byteLength !== expected) {
    throw new Error(`Terreno con tamaño inesperado: ${buffer.byteLength} bytes, se esperaban ${expected}`);
  }
  const view = new DataView(buffer);
  const heights = new Float32Array(size * size);
  for (let i = 0; i < heights.length; i++) heights[i] = view.getFloat32(i * 4, true);
  return heights;
}

export function samplePatch(patch: TerrainPatch, col: number, row: number): number {
  const n = patch.size;
  const c = Math.min(Math.max(col, 0), n - 1);
  const r = Math.min(Math.max(row, 0), n - 1);
  const c0 = Math.min(Math.floor(c), n - 2);
  const r0 = Math.min(Math.floor(r), n - 2);
  const fc = c - c0;
  const fr = r - r0;
  const h = patch.heights;
  const a = h[r0 * n + c0];
  const b = h[r0 * n + c0 + 1];
  const d = h[(r0 + 1) * n + c0];
  const e = h[(r0 + 1) * n + c0 + 1];
  return a * (1 - fc) * (1 - fr) + b * fc * (1 - fr) + d * (1 - fc) * fr + e * fc * fr;
}

export function horizonElevationAt(profile: HorizonProfile, azimuthDeg: number): number | null {
  const n = profile.elevationDeg.length;
  const position = (((azimuthDeg % 360) + 360) % 360) / profile.stepDeg;
  const base = Math.floor(position);
  const i0 = base % n;
  const i1 = (i0 + 1) % n;
  const t = position - base;
  const a = profile.elevationDeg[i0];
  const b = profile.elevationDeg[i1];
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  return a + (b - a) * t;
}

export function loadManifest(): Promise<Manifest | null> {
  if (!manifestPromise) {
    manifestPromise = fetchOk('manifest.json')
      .then((response) => response.json() as Promise<Manifest>)
      .catch((error) => {
        console.warn('No se pudo cargar el manifiesto de datos lunares', error);
        return null;
      });
  }
  return manifestPromise;
}

async function loadTerrain(entry: ManifestSite): Promise<TerrainPatch | null> {
  const meta = entry.terrain;
  if (!meta) return null;
  try {
    const response = await fetchOk(meta.file);
    const heights = parseTerrain(await response.arrayBuffer(), meta.size);
    return {
      size: meta.size,
      extentM: meta.extent_m,
      stepM: meta.step_m,
      siteHeightM: meta.site_height_m,
      minM: meta.min_m,
      maxM: meta.max_m,
      heights,
    };
  } catch (error) {
    console.warn(`Terreno real no disponible para ${entry.id}`, error);
    return null;
  }
}

async function loadHorizon(entry: ManifestSite): Promise<HorizonProfile | null> {
  const meta = entry.horizon;
  if (!meta) return null;
  try {
    const response = await fetchOk(meta.file);
    const data = (await response.json()) as HorizonFile;
    return {
      elevationDeg: data.elevation_deg,
      stepDeg: data.azimuth_step_deg,
      observerHeightM: data.observer_height_m,
      maxRadiusM: data.max_radius_m,
      minReachKm: data.min_reach_km,
    };
  } catch (error) {
    console.warn(`Horizonte real no disponible para ${entry.id}`, error);
    return null;
  }
}

async function fetchSiteData(siteId: string): Promise<SiteData> {
  const manifest = await loadManifest();
  const entry = manifest?.sites.find((site) => site.id === siteId);
  if (!entry) return { terrain: null, horizon: null };
  const [terrain, horizon] = await Promise.all([loadTerrain(entry), loadHorizon(entry)]);
  return { terrain, horizon };
}

export function loadSiteData(siteId: string): Promise<SiteData> {
  let cached = siteCache.get(siteId);
  if (!cached) {
    cached = fetchSiteData(siteId);
    siteCache.set(siteId, cached);
  }
  return cached;
}