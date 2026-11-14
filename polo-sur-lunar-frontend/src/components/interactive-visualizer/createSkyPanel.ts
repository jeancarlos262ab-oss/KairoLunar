import { findNextBodyEvent, getBodyHorizontal, type Body } from './lunarEphemeris';
import { element, PANEL_STYLE } from './ui';

export interface SkySite {
  name: string;
  lat: number;
  lon: number;
}

export interface SkyPanelOptions {
  getSite: () => SkySite;
}

export interface SkyPanelResult {
  element: HTMLElement;
  update: (date: Date) => void;
  dispose: () => void;
}

interface CountdownCache {
  key: string;
  from: number;
  until: number;
  visible: boolean;
  next: Date | null;
}

interface BodyRow {
  values: HTMLElement;
  countdown: HTMLElement;
  status: HTMLElement;
}

const CHART_SIZE = 200;
const CHART_RADIUS = 86;
const MIN_ELEVATION = -10;
const SEARCH_DAYS = 32;
const DAY_MS = 86400000;
const SUN_PATH_STEP_MS = 30 * 60 * 1000;
const SUN_PATH_STEPS = 48;
const EARTH_PATH_STEP_MS = 6 * 3600 * 1000;
const EARTH_PATH_STEPS = 113;

const COLORS: Record<Body, string> = { sun: '#ffd24a', earth: '#4da3ff' };

export function formatRemaining(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days >= 1) return `${days} d ${hours} h`;
  if (hours >= 1) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

export function createSkyPanel(container: HTMLElement, options: SkyPanelOptions): SkyPanelResult {
  const caches: Record<Body, CountdownCache | null> = { sun: null, earth: null };

  const panel = element('div', {
    ...PANEL_STYLE,
    bottom: '16px',
    right: '16px',
    width: '250px',
  });
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Posición del Sol y de la Tierra sobre el horizonte');

  const title = element('div', { fontWeight: '700' });

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = element('canvas', {
    width: `${CHART_SIZE}px`,
    height: `${CHART_SIZE}px`,
    alignSelf: 'center',
  });
  canvas.width = CHART_SIZE * dpr;
  canvas.height = CHART_SIZE * dpr;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'Diagrama del cielo visto desde arriba: el centro es el cenit, el borde es el horizonte, el norte arriba y el este a la derecha.',
  );
  const ctx = canvas.getContext('2d');

  const buildRow = (body: Body, label: string): { root: HTMLElement; row: BodyRow } => {
    const root = element('div', {
      borderTop: '1px solid rgba(255,255,255,0.2)',
      paddingTop: '6px',
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
    });
    const head = element('div', { display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600' });
    const dot = element('span', {
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      background: COLORS[body],
      display: 'inline-block',
    });
    head.append(dot, document.createTextNode(label));
    const values = element('div', { color: '#cfcfcf' });
    const countdown = element('div', { fontSize: '15px', fontWeight: '700', color: COLORS[body] });
    const status = element('div', { color: '#bbbbbb', fontSize: '12px' });
    root.append(head, values, countdown, status);
    return { root, row: { values, countdown, status } };
  };

  const sunBuilt = buildRow('sun', 'Sol');
  const earthBuilt = buildRow('earth', 'Tierra');
  panel.append(title, canvas, sunBuilt.root, earthBuilt.root);
  container.appendChild(panel);

  const getCountdown = (body: Body, date: Date, site: SkySite): CountdownCache => {
    const key = `${site.lat}|${site.lon}|${body}`;
    const ms = date.getTime();
    const cached = caches[body];
    if (cached && cached.key === key && ms >= cached.from && ms < cached.until) return cached;

    const visible = getBodyHorizontal(date, body, site.lat, site.lon).elevation > 0;
    const next = findNextBodyEvent(date, body, visible ? 'set' : 'rise', site.lat, site.lon, SEARCH_DAYS);
    const fresh: CountdownCache = {
      key,
      from: ms,
      until: next ? next.getTime() : ms + SEARCH_DAYS * DAY_MS,
      visible,
      next,
    };
    caches[body] = fresh;
    return fresh;
  };

  const project = (azimuth: number, elevation: number): [number, number] => {
    const clamped = Math.max(elevation, MIN_ELEVATION);
    const r = ((90 - clamped) / 90) * CHART_RADIUS;
    const az = (azimuth * Math.PI) / 180;
    const c = CHART_SIZE / 2;
    return [c + r * Math.sin(az), c - r * Math.cos(az)];
  };

  const drawPath = (
    context: CanvasRenderingContext2D,
    body: Body,
    start: Date,
    steps: number,
    stepMs: number,
    site: SkySite,
  ): void => {
    context.strokeStyle = COLORS[body];
    context.globalAlpha = 0.55;
    context.lineWidth = body === 'sun' ? 2 : 1.5;
    context.beginPath();
    let drawing = false;
    for (let i = 0; i <= steps; i++) {
      const h = getBodyHorizontal(new Date(start.getTime() + i * stepMs), body, site.lat, site.lon);
      if (h.elevation < MIN_ELEVATION) {
        drawing = false;
        continue;
      }
      const [x, y] = project(h.azimuth, h.elevation);
      if (drawing) context.lineTo(x, y);
      else context.moveTo(x, y);
      drawing = true;
    }
    context.stroke();
    context.globalAlpha = 1;
  };

  const drawMarker = (
    context: CanvasRenderingContext2D,
    body: Body,
    azimuth: number,
    elevation: number,
  ): void => {
    const [x, y] = project(azimuth, elevation);
    const above = elevation > 0;
    const radius = body === 'sun' ? 6 : 7;
    context.globalAlpha = above ? 1 : 0.45;
    context.fillStyle = COLORS[body];
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#ffffff';
    context.lineWidth = 1.5;
    if (!above) context.setLineDash([3, 3]);
    context.stroke();
    context.setLineDash([]);
    context.globalAlpha = 1;
  };

  const drawChart = (date: Date, site: SkySite, sun: { azimuth: number; elevation: number }, earth: { azimuth: number; elevation: number }): void => {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, CHART_SIZE, CHART_SIZE);
    const c = CHART_SIZE / 2;

    ctx.fillStyle = '#05070d';
    ctx.beginPath();
    ctx.arc(c, c, CHART_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    [30, 60].forEach((el) => {
      ctx.beginPath();
      ctx.arc(c, c, ((90 - el) / 90) * CHART_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(c, c - CHART_RADIUS);
    ctx.lineTo(c, c + CHART_RADIUS);
    ctx.moveTo(c - CHART_RADIUS, c);
    ctx.lineTo(c + CHART_RADIUS, c);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(c, c, CHART_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', c, c - CHART_RADIUS - 8);
    ctx.fillText('S', c, c + CHART_RADIUS + 8);
    ctx.fillText('E', c + CHART_RADIUS + 8, c);
    ctx.fillText('O', c - CHART_RADIUS - 8, c);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillText('30°', c + 3, c - ((90 - 30) / 90) * CHART_RADIUS + 8);
    ctx.fillText('60°', c + 3, c - ((90 - 60) / 90) * CHART_RADIUS + 8);

    drawPath(ctx, 'earth', date, EARTH_PATH_STEPS, EARTH_PATH_STEP_MS, site);
    drawPath(ctx, 'sun', date, SUN_PATH_STEPS, SUN_PATH_STEP_MS, site);
    drawMarker(ctx, 'earth', earth.azimuth, earth.elevation);
    drawMarker(ctx, 'sun', sun.azimuth, sun.elevation);
  };

  const fillRow = (
    row: BodyRow,
    body: Body,
    date: Date,
    site: SkySite,
    h: { azimuth: number; elevation: number },
  ): void => {
    const cd = getCountdown(body, date, site);
    const name = body === 'sun' ? 'Sol' : 'Tierra';
    row.values.textContent = `Elevación ${h.elevation.toFixed(1)}° · Azimut ${h.azimuth.toFixed(0)}°`;

    if (cd.next) {
      const remaining = formatRemaining(cd.next.getTime() - date.getTime());
      const label =
        body === 'sun'
          ? cd.visible
            ? 'Puesta de Sol en'
            : 'Amanecer en'
          : cd.visible
            ? 'Puesta de la Tierra en'
            : 'Salida de la Tierra en';
      row.countdown.textContent = `${label} ${remaining}`;
    } else {
      row.countdown.textContent = cd.visible
        ? `${name} sobre el horizonte ≥ ${SEARCH_DAYS} d`
        : `${name} bajo el horizonte ≥ ${SEARCH_DAYS} d`;
    }

    if (body === 'sun') {
      row.status.textContent = cd.visible ? 'Generación solar posible' : 'Sin generación solar';
    } else {
      row.status.textContent = cd.visible
        ? 'Línea de vista directa a la Tierra'
        : 'Sin línea de vista a la Tierra';
    }
  };

  const update = (date: Date): void => {
    const site = options.getSite();
    title.textContent = `Cielo en ${site.name}`;
    const sun = getBodyHorizontal(date, 'sun', site.lat, site.lon);
    const earth = getBodyHorizontal(date, 'earth', site.lat, site.lon);
    drawChart(date, site, sun, earth);
    fillRow(sunBuilt.row, 'sun', date, site, sun);
    fillRow(earthBuilt.row, 'earth', date, site, earth);
  };

  return { element: panel, update, dispose: () => panel.remove() };
}