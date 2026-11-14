const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const SYNODIC_MONTH_DAYS = 29.530588861;
const LUNAR_AXIAL_TILT_DEG = 1.5424;
const MS_PER_DAY = 86400000;

export interface SubSolarPoint {
  latitude: number;
  longitude: number;
}

export interface SunHorizontal {
  azimuth: number;
  elevation: number;
  subSolar: SubSolarPoint;
}

export type SunEventKind = 'sunrise' | 'sunset';

function normalize360(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function normalize180(degrees: number): number {
  const n = normalize360(degrees);
  return n > 180 ? n - 360 : n;
}

function julianCenturies(date: Date): number {
  const jd = date.getTime() / MS_PER_DAY + 2440587.5;
  return (jd - 2451545.0) / 36525;
}

function sunEclipticLongitude(t: number): number {
  const l0 = 280.46646 + 36000.76983 * t + 0.0003032 * t * t;
  const m = (357.52911 + 35999.05029 * t - 0.0001537 * t * t) * RAD;
  const c =
    (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(m) +
    (0.019993 - 0.000101 * t) * Math.sin(2 * m) +
    0.000289 * Math.sin(3 * m);
  const omega = (125.04 - 1934.136 * t) * RAD;
  return normalize360(l0 + c - 0.00569 - 0.00478 * Math.sin(omega));
}

function moonMeanLongitude(t: number): number {
  return normalize360(218.3164477 + 481267.88123421 * t - 0.0015786 * t * t);
}

function lunarNodeLongitude(t: number): number {
  return normalize360(125.04452 - 1934.136261 * t + 0.0020708 * t * t);
}

export function getSubSolarPoint(date: Date): SubSolarPoint {
  const t = julianCenturies(date);
  const sunLon = sunEclipticLongitude(t);
  const moonLon = moonMeanLongitude(t);
  const node = lunarNodeLongitude(t);
  const longitude = normalize180(sunLon - moonLon - 180);
  const latitude = Math.asin(Math.sin(LUNAR_AXIAL_TILT_DEG * RAD) * Math.sin((sunLon - node) * RAD)) * DEG;
  return { latitude, longitude };
}

export function getSunHorizontal(date: Date, latitude: number, longitude: number): SunHorizontal {
  const subSolar = getSubSolarPoint(date);
  const phi = latitude * RAD;
  const delta = subSolar.latitude * RAD;
  const dLon = (subSolar.longitude - longitude) * RAD;

  const sinEl = Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(dLon);
  const elevation = Math.asin(Math.min(1, Math.max(-1, sinEl))) * DEG;

  const y = Math.sin(dLon) * Math.cos(delta);
  const x = Math.cos(phi) * Math.sin(delta) - Math.sin(phi) * Math.cos(delta) * Math.cos(dLon);
  const azimuth = normalize360(Math.atan2(y, x) * DEG);

  return { azimuth, elevation, subSolar };
}

export function getMoonAgeDays(date: Date): number {
  const t = julianCenturies(date);
  const elongation = normalize360(moonMeanLongitude(t) - sunEclipticLongitude(t));
  return (elongation / 360) * SYNODIC_MONTH_DAYS;
}

export function getSynodicMonthDays(): number {
  return SYNODIC_MONTH_DAYS;
}

export function findNextSunEvent(
  from: Date,
  kind: SunEventKind,
  latitude: number,
  longitude: number,
  maxDays = 32,
): Date | null {
  const stepMs = 30 * 60 * 1000;
  const limit = from.getTime() + maxDays * MS_PER_DAY;
  const elevationAt = (ms: number): number => getSunHorizontal(new Date(ms), latitude, longitude).elevation;

  let previousMs = from.getTime();
  let previous = elevationAt(previousMs);

  for (let ms = previousMs + stepMs; ms <= limit; ms += stepMs) {
    const current = elevationAt(ms);
    const crossed = kind === 'sunrise' ? previous < 0 && current >= 0 : previous >= 0 && current < 0;
    if (crossed) {
      let lo = previousMs;
      let hi = ms;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        const e = elevationAt(mid);
        const below = kind === 'sunrise' ? e < 0 : e >= 0;
        if (below) lo = mid;
        else hi = mid;
      }
      return new Date(hi);
    }
    previousMs = ms;
    previous = current;
  }
  return null;
}