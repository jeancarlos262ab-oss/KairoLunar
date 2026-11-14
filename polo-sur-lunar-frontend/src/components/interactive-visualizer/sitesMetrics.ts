import { getSunHorizontal } from './lunarEphemeris';

export const COMPARISON_DAYS = 30;
const RAD = Math.PI / 180;
const HOUR_MS = 3600000;

export interface SiteMetrics {
  daylightPercent: number;
  maxElevation: number;
  longestDayHours: number;
  longestDayOpen: boolean;
  longestNightHours: number;
  longestNightOpen: boolean;
  energyIndex: number;
  elevations: Float32Array;
}

interface Run {
  length: number;
  open: boolean;
}

function longestRun(values: Float32Array, predicate: (value: number) => boolean): Run {
  const count = values.length;
  let best = 0;
  let bestOpen = false;
  let runStart = -1;

  for (let i = 0; i < count; i++) {
    const on = predicate(values[i]);
    if (on && runStart < 0) runStart = i;
    if ((!on || i === count - 1) && runStart >= 0) {
      const end = on ? i + 1 : i;
      const length = end - runStart;
      if (length > best) {
        best = length;
        bestOpen = runStart === 0 || end === count;
      }
      runStart = -1;
    }
  }
  return { length: best, open: bestOpen };
}

export function computeSiteMetrics(
  lat: number,
  lon: number,
  start: Date,
  days: number = COMPARISON_DAYS,
): SiteMetrics {
  const count = days * 24 + 1;
  const elevations = new Float32Array(count);
  let lit = 0;
  let max = -90;
  let energy = 0;

  for (let i = 0; i < count; i++) {
    const elevation = getSunHorizontal(new Date(start.getTime() + i * HOUR_MS), lat, lon).elevation;
    elevations[i] = elevation;
    if (elevation > 0) {
      lit++;
      energy += Math.sin(elevation * RAD);
    }
    if (elevation > max) max = elevation;
  }

  const day = longestRun(elevations, (e) => e > 0);
  const night = longestRun(elevations, (e) => e <= 0);

  return {
    daylightPercent: (lit / count) * 100,
    maxElevation: max,
    longestDayHours: day.length,
    longestDayOpen: day.open,
    longestNightHours: night.length,
    longestNightOpen: night.open,
    energyIndex: (energy / count) * 100,
    elevations,
  };
}

export function formatDuration(hours: number, open: boolean): string {
  const prefix = open ? '≥ ' : '';
  if (hours <= 0) return '0 h';
  if (hours >= 48) return `${prefix}${(hours / 24).toFixed(1)} d`;
  return `${prefix}${hours.toFixed(0)} h`;
}