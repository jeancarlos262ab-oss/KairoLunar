const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const SYNODIC_MONTH_DAYS = 29.530588861;
const LUNAR_AXIAL_TILT_DEG = 1.5424;
const MS_PER_DAY = 86400000;
const EARTH_EQUATORIAL_RADIUS_KM = 6378.14;
const MOON_RADIUS_KM = 1737.4;

type Vec3 = [number, number, number];

export interface SubPoint {
  latitude: number;
  longitude: number;
}

export type SubSolarPoint = SubPoint;

export interface SunHorizontal {
  azimuth: number;
  elevation: number;
  subSolar: SubSolarPoint;
}

export interface EarthHorizontal {
  azimuth: number;
  elevation: number;
  subEarth: SubPoint;
  distanceKm: number;
}

export type Body = 'sun' | 'earth';
export type BodyEventKind = 'rise' | 'set';
export type SunEventKind = 'sunrise' | 'sunset';

function normalize360(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function normalize180(degrees: number): number {
  const n = normalize360(degrees);
  return n > 180 ? n - 360 : n;
}

function sinD(degrees: number): number {
  return Math.sin(degrees * RAD);
}

function cosD(degrees: number): number {
  return Math.cos(degrees * RAD);
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function eclipticVector(lonDeg: number, latDeg: number): Vec3 {
  const cl = cosD(latDeg);
  return [cl * cosD(lonDeg), cl * sinD(lonDeg), sinD(latDeg)];
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

interface MoonGeocentric {
  lon: number;
  lat: number;
  distanceKm: number;
}

function moonGeocentric(t: number): MoonGeocentric {
  const lon =
    218.32 +
    481267.881 * t +
    6.29 * sinD(135.0 + 477198.87 * t) -
    1.27 * sinD(259.3 - 413335.36 * t) +
    0.66 * sinD(235.7 + 890534.22 * t) +
    0.21 * sinD(269.9 + 954397.74 * t) -
    0.19 * sinD(357.5 + 35999.05 * t) -
    0.11 * sinD(186.5 + 966404.03 * t);

  const lat =
    5.13 * sinD(93.3 + 483202.02 * t) +
    0.28 * sinD(228.2 + 960400.89 * t) -
    0.28 * sinD(318.3 + 6003.15 * t) -
    0.17 * sinD(217.6 - 407332.21 * t);

  const parallax =
    0.9508 +
    0.0518 * cosD(135.0 + 477198.87 * t) +
    0.0095 * cosD(259.3 - 413335.36 * t) +
    0.0078 * cosD(235.7 + 890534.22 * t) +
    0.0028 * cosD(269.9 + 954397.74 * t);

  return {
    lon: normalize360(lon),
    lat,
    distanceKm: EARTH_EQUATORIAL_RADIUS_KM / sinD(parallax),
  };
}

interface BodyFrame {
  x: Vec3;
  y: Vec3;
  z: Vec3;
}

function moonBodyFrame(t: number): BodyFrame {
  const omega = lunarNodeLongitude(t);
  const tilt = LUNAR_AXIAL_TILT_DEG;
  const pole: Vec3 = [-sinD(tilt) * sinD(omega), sinD(tilt) * cosD(omega), cosD(tilt)];
  const node: Vec3 = [-cosD(omega), -sinD(omega), 0];
  const angle = moonMeanLongitude(t) - omega;
  const perpendicular = cross(pole, node);
  const c = cosD(angle);
  const s = sinD(angle);
  const x: Vec3 = [
    node[0] * c + perpendicular[0] * s,
    node[1] * c + perpendicular[1] * s,
    node[2] * c + perpendicular[2] * s,
  ];
  const y = cross(pole, x);
  return { x, y, z: pole };
}

function toSelenographic(v: Vec3, frame: BodyFrame): SubPoint {
  const z = Math.min(1, Math.max(-1, dot(v, frame.z)));
  return {
    latitude: Math.asin(z) * DEG,
    longitude: Math.atan2(dot(v, frame.y), dot(v, frame.x)) * DEG,
  };
}

export function getSubSolarPoint(date: Date): SubSolarPoint {
  const t = julianCenturies(date);
  return toSelenographic(eclipticVector(sunEclipticLongitude(t), 0), moonBodyFrame(t));
}

export function getSubEarthPoint(date: Date): SubPoint & { distanceKm: number } {
  const t = julianCenturies(date);
  const moon = moonGeocentric(t);
  const toMoon = eclipticVector(moon.lon, moon.lat);
  const toEarth: Vec3 = [-toMoon[0], -toMoon[1], -toMoon[2]];
  return { ...toSelenographic(toEarth, moonBodyFrame(t)), distanceKm: moon.distanceKm };
}

function horizontalFromSubPoint(
  sub: SubPoint,
  latitude: number,
  longitude: number,
  parallaxRatio: number,
): { azimuth: number; elevation: number } {
  const phi = latitude * RAD;
  const delta = sub.latitude * RAD;
  const dLon = (sub.longitude - longitude) * RAD;

  const c = Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(dLon);
  const k = parallaxRatio;
  const sinEl = (c - k) / Math.sqrt(1 - 2 * k * c + k * k);
  const elevation = Math.asin(Math.min(1, Math.max(-1, sinEl))) * DEG;

  const y = Math.sin(dLon) * Math.cos(delta);
  const x = Math.cos(phi) * Math.sin(delta) - Math.sin(phi) * Math.cos(delta) * Math.cos(dLon);
  const azimuth = normalize360(Math.atan2(y, x) * DEG);

  return { azimuth, elevation };
}

export function getSunHorizontal(date: Date, latitude: number, longitude: number): SunHorizontal {
  const subSolar = getSubSolarPoint(date);
  return { ...horizontalFromSubPoint(subSolar, latitude, longitude, 0), subSolar };
}

export function getEarthHorizontal(date: Date, latitude: number, longitude: number): EarthHorizontal {
  const subEarth = getSubEarthPoint(date);
  const ratio = MOON_RADIUS_KM / subEarth.distanceKm;
  return {
    ...horizontalFromSubPoint(subEarth, latitude, longitude, ratio),
    subEarth: { latitude: subEarth.latitude, longitude: subEarth.longitude },
    distanceKm: subEarth.distanceKm,
  };
}

export function getBodyElevation(date: Date, body: Body, latitude: number, longitude: number): number {
  return body === 'sun'
    ? getSunHorizontal(date, latitude, longitude).elevation
    : getEarthHorizontal(date, latitude, longitude).elevation;
}

export function getBodyHorizontal(
  date: Date,
  body: Body,
  latitude: number,
  longitude: number,
): { azimuth: number; elevation: number } {
  const h =
    body === 'sun'
      ? getSunHorizontal(date, latitude, longitude)
      : getEarthHorizontal(date, latitude, longitude);
  return { azimuth: h.azimuth, elevation: h.elevation };
}

export function getMoonAgeDays(date: Date): number {
  const t = julianCenturies(date);
  const elongation = normalize360(moonMeanLongitude(t) - sunEclipticLongitude(t));
  return (elongation / 360) * SYNODIC_MONTH_DAYS;
}

export function getSynodicMonthDays(): number {
  return SYNODIC_MONTH_DAYS;
}

export type HorizonFn = (azimuthDeg: number) => number;

export function findNextBodyEvent(
  from: Date,
  body: Body,
  kind: BodyEventKind,
  latitude: number,
  longitude: number,
  maxDays = 32,
  horizon?: HorizonFn,
): Date | null {
  const stepMs = 30 * 60 * 1000;
  const limit = from.getTime() + maxDays * MS_PER_DAY;
  const marginAt = (ms: number): number => {
    const h = getBodyHorizontal(new Date(ms), body, latitude, longitude);
    return h.elevation - (horizon ? horizon(h.azimuth) : 0);
  };

  let previousMs = from.getTime();
  let previous = marginAt(previousMs);

  for (let ms = previousMs + stepMs; ms <= limit; ms += stepMs) {
    const current = marginAt(ms);
    const crossed = kind === 'rise' ? previous < 0 && current >= 0 : previous >= 0 && current < 0;
    if (crossed) {
      let lo = previousMs;
      let hi = ms;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        const m = marginAt(mid);
        const below = kind === 'rise' ? m < 0 : m >= 0;
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

export function findNextSunEvent(
  from: Date,
  kind: SunEventKind,
  latitude: number,
  longitude: number,
  maxDays = 32,
  horizon?: HorizonFn,
): Date | null {
  return findNextBodyEvent(
    from,
    'sun',
    kind === 'sunrise' ? 'rise' : 'set',
    latitude,
    longitude,
    maxDays,
    horizon,
  );
}