/**
 * Motor de datos SIMULADO (sustituye a @lsp/engine, que no viene en el proyecto).
 * Mantiene la misma interfaz que usa la pantalla de inicio: rejilla de tiempo, series por sitio,
 * métricas, eventos y puntuación. La geometría es coherente (Sol/Tierra como vectores en el marco
 * lunar fijo y elevaciones calculadas por producto escalar con la normal de cada sitio), pero los
 * valores son sintéticos: cuando exista el motor real basta con sustituir este archivo.
 */
export const DAY_MS = 86_400_000
export const HOUR_MS = 3_600_000
export const SUN_SEMIDIAMETER_DEG = 0.267
export const MOON_RADIUS_KM = 1737.4

const DEG = Math.PI / 180
const STEP_MS = 1_800_000 // 30 min: igual que el paso del control de tiempo

const COLORS = ['#46c7e8', '#f3e27a', '#e0a15a', '#b67cff', '#9bd34a', '#5b7bff', '#46d6c8', '#7fa0ff', '#ff8a65']
export const colorForIndex = (i) => COLORS[i % COLORS.length]

// Coordenadas aproximadas (lat°, lon°E) de sitios candidatos cerca del polo sur.
export const DEFAULT_SITES = [
  { id: 'shackleton-connecting-ridge', name: 'Shackleton Connecting Ridge', lat: -89.5, lon: 189.5 },
  { id: 'shackleton-rim', name: 'Shackleton Rim', lat: -89.65, lon: 111 },
  { id: 'de-gerlache-rim', name: 'de Gerlache Rim', lat: -88.8, lon: 270 },
  { id: 'haworth', name: 'Haworth', lat: -87.55, lon: 2 },
  { id: 'malapert', name: 'Malapert Massif', lat: -85.95, lon: 4 },
  { id: 'cabeus', name: 'Cabeus', lat: -84.9, lon: 327 },
  { id: 'faustini-rim', name: 'Faustini Rim', lat: -87.0, lon: 80 },
  { id: 'nobile-rim', name: 'Nobile Rim', lat: -85.0, lon: 56 },
  { id: 'amundsen-rim', name: 'Amundsen Rim', lat: -84.2, lon: 84 },
]

const SUN_EL0 = 1.28 // elevación del Sol en el polo al inicio de la ventana
const SUN_LON0 = 120 // longitud del Sol visto desde el polo al inicio
const EARTH_AMP = 6.16
const EARTH_PHI0 = -0.78

/** Sol y Tierra (vectores unitarios en el marco lunar fijo: x→lon 0°, y→90°E, z→norte) en el día d desde el inicio. */
function bodies(d) {
  const sunEl = (SUN_EL0 - 0.004 * d) * DEG
  const sl = (SUN_LON0 - 12.19 * d) * DEG
  const sun = [Math.cos(sunEl) * Math.cos(sl), Math.cos(sunEl) * Math.sin(sl), -Math.sin(sunEl)]
  const w = (2 * Math.PI) / 27.55
  const eEl = EARTH_AMP * Math.sin(w * d + EARTH_PHI0) * DEG
  const el = (7.5 * Math.sin(w * d - 0.08) - 0.1) * DEG
  const earth = [Math.cos(eEl) * Math.cos(el), Math.cos(eEl) * Math.sin(el), -Math.sin(eEl)]
  return { sun, earth }
}

export function buildGrid(startMs, spanDays) {
  const n = Math.round((spanDays * DAY_MS) / STEP_MS) + 1
  const frames = new Array(n)
  for (let i = 0; i < n; i++) frames[i] = bodies((i * STEP_MS) / DAY_MS)
  return { startMs, spanDays, stepMs: STEP_MS, n, frames }
}

export const sampleIndex = (grid, ms) => Math.max(0, Math.min(grid.n - 1, Math.round((ms - grid.startMs) / grid.stepMs)))

function local(site) {
  const la = site.lat * DEG
  const lo = site.lon * DEG
  return {
    n: [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)],
    e: [-Math.sin(lo), Math.cos(lo), 0],
    t: [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)],
  }
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const azOf = (v, f) => {
  const a = Math.atan2(dot(v, f.e), dot(v, f.t)) / DEG
  return a < 0 ? a + 360 : a
}

function longestRun(arr, value) {
  let best = 0
  let cur = 0
  let bestStart = -1
  let start = 0
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === value) {
      if (cur === 0) start = i
      cur++
      if (cur > best) {
        best = cur
        bestStart = start
      }
    } else cur = 0
  }
  return { len: best, start: bestStart }
}

/** Punto subsolar / subterrestre (lat, lon°E) de un vector del marco lunar fijo. */
export function subPoint(v) {
  return { lat: Math.asin(Math.max(-1, Math.min(1, v[2]))) / DEG, lon: ((Math.atan2(v[1], v[0]) / DEG) + 360) % 360 }
}

export function analyzeSite(grid, site, mask = 0) {
  const f = local(site)
  const n = grid.n
  const sunEl = new Float32Array(n)
  const sunAz = new Float32Array(n)
  const earthEl = new Float32Array(n)
  const earthAz = new Float32Array(n)
  const sunUp = new Uint8Array(n)
  const earthUp = new Uint8Array(n)
  let s = 0
  let e = 0
  let b = 0
  let maxS = -90
  let maxE = -90
  let energy = 0
  for (let i = 0; i < n; i++) {
    const { sun, earth } = grid.frames[i]
    sunEl[i] = Math.asin(Math.max(-1, Math.min(1, dot(sun, f.n)))) / DEG
    earthEl[i] = Math.asin(Math.max(-1, Math.min(1, dot(earth, f.n)))) / DEG
    sunAz[i] = azOf(sun, f)
    earthAz[i] = azOf(earth, f)
    sunUp[i] = sunEl[i] + SUN_SEMIDIAMETER_DEG > mask ? 1 : 0
    earthUp[i] = earthEl[i] > mask ? 1 : 0
    s += sunUp[i]
    maxS = Math.max(maxS, sunEl[i])
    maxE = Math.max(maxE, earthEl[i])
    energy += Math.max(0, Math.sin(Math.max(0, sunEl[i]) * DEG))
    e += earthUp[i]
    if (sunUp[i] && earthUp[i]) b++
  }
  const stepH = grid.stepMs / HOUR_MS
  const dark = longestRun(sunUp, 0)
  const blackout = longestRun(earthUp, 0)
  return {
    series: { sunEl, sunAz, earthEl, earthAz },
    vis: { sunUp, earthUp },
    metrics: {
      sunPct: s / n,
      earthPct: e / n,
      bothPct: b / n,
      sunEnergyPct: Math.min(1, (energy / n) / Math.sin(1.54 * DEG)),
      maxSunEl: maxS,
      maxEarthEl: maxE,
      longestDarkH: dark.len * stepH,
      longestBlackoutH: blackout.len * stepH,
    },
    horizonSource: 'none',
  }
}

export function scoreSite(m, priority = 0.5) {
  const base = priority * m.sunPct + (1 - priority) * m.earthPct
  const darkPenalty = Math.min(1, m.longestDarkH / 24 / 12) * 0.3
  return Math.max(0, Math.min(100, 100 * (0.75 * base + 0.25 * m.bothPct) * (1 - darkPenalty)))
}

export function analyzeAll(grid, sites, mask = 0, priority = 0.5) {
  return sites.map((site, i) => {
    const r = analyzeSite(grid, site, mask)
    return { site, color: colorForIndex(i), ...r, score: scoreSite(r.metrics, priority) }
  })
}

/** Próximos cambios (amanecer/ocaso del Sol, salida/puesta de la Tierra) desde el índice idx. */
function changes(a, grid, idx, kind) {
  const arr = kind === 'sun' ? a.vis.sunUp : a.vis.earthUp
  const first = arr[idx]
  for (let j = idx + 1; j < grid.n; j++) {
    if (arr[j] !== first) {
      const ms = grid.startMs + j * grid.stepMs
      return { kind, toOn: arr[j] === 1, inHours: ((j - idx) * grid.stepMs) / HOUR_MS, ms, j }
    }
  }
  return null
}

export function siteEvents(a, grid, idx) {
  const dark = longestRun(a.vis.sunUp, 0)
  return {
    sun: changes(a, grid, idx, 'sun'),
    earth: changes(a, grid, idx, 'earth'),
    longestDark: dark.len > 0 ? { hours: (dark.len * grid.stepMs) / HOUR_MS, startMs: grid.startMs + dark.start * grid.stepMs } : null,
  }
}

export function upcomingEvents(a, grid, idx, count) {
  const out = []
  for (const kind of ['sun', 'earth']) {
    const arr = kind === 'sun' ? a.vis.sunUp : a.vis.earthUp
    let prev = arr[idx]
    for (let j = idx + 1; j < grid.n; j++) {
      if (arr[j] !== prev) {
        const toOn = arr[j] === 1
        out.push({
          kind,
          toOn,
          title: kind === 'sun' ? (toOn ? 'Sunrise' : 'Sunset') : toOn ? 'Earthrise' : 'Earthset',
          ms: grid.startMs + j * grid.stepMs,
          inHours: ((j - idx) * grid.stepMs) / HOUR_MS,
        })
        prev = arr[j]
      }
    }
  }
  return out.sort((x, y) => x.ms - y.ms).slice(0, count)
}

export function bestWindows(analyses, grid, planDays, priority) {
  const best = [...analyses].sort((a, b) => b.score - a.score)[0]
  return best ? [{ site: best.site, startMs: grid.startMs, score: best.score }] : []
}
