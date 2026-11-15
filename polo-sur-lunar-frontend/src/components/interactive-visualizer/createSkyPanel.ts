import {
  findNextBodyEvent,
  getBodyHorizontal,
  type Body,
  type HorizonFn,
} from './lunarEphemeris';
import { makeHorizonFn, type HorizonProfile } from './data/loadLunarData';
import { onLangChange, tr } from './i18n';
import { element } from './ui';
import { siteLabel, type SiteCategory } from './sites';

export interface SkySite {
  name: string;
  lat: number;
  lon: number;
  category?: SiteCategory;
}

export interface SkyPanelOptions {
  getSite: () => SkySite;
  getHorizon?: () => HorizonProfile | null;
}

export interface SkyPanelResult {
  element: HTMLElement;
  update: (date: Date) => void;
  dispose: () => void;
}

interface CountdownCache {
  key: string;
  profile: HorizonProfile | null;
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
const HORIZON_STEP_DEG = 2;
const CHART_FONT = "'Space Grotesk', system-ui, sans-serif";

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

function describeHorizon(profile: HorizonProfile | null, site: SkySite): string {
  if (!profile) return tr('Horizonte esférico (sin datos LOLA para este sitio)');
  const radiusKm = Math.round(profile.maxRadiusM / 1000);
  const source = site.category === 'artemis' ? tr('Artemis III (centro de la región)') : 'LOLA';
  const base = `${tr('Horizonte')} ${source} · ${tr('radio')} ${radiusKm} km`;
  if (profile.minReachKm < radiusKm * 0.5) {
    return `${base} · ⚠ ${tr('cobertura parcial')} (≥ ${profile.minReachKm.toFixed(1)} km)`;
  }
  return base;
}

export function createSkyPanel(container: HTMLElement, options: SkyPanelOptions): SkyPanelResult {
  const caches: Record<Body, CountdownCache | null> = { sun: null, earth: null };

  const panel = element('div', 'kv-panel kv-sky');
  panel.setAttribute('role', 'region');

  const title = element('div', 'kv-title');

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = element('canvas', 'kv-canvas');
  canvas.style.width = `${CHART_SIZE}px`;
  canvas.style.height = `${CHART_SIZE}px`;
  canvas.width = CHART_SIZE * dpr;
  canvas.height = CHART_SIZE * dpr;
  canvas.setAttribute('role', 'img');
  const ctx = canvas.getContext('2d');

  const buildRow = (body: Body): { root: HTMLElement; row: BodyRow; headText: Text } => {
    const root = element('div', 'kv-body');
    const head = element('div', 'kv-body-head');
    const dot = element('span', 'kv-dot');
    dot.style.background = COLORS[body];
    const headText = document.createTextNode('');
    head.append(dot, headText);
    const values = element('div', 'kv-muted kv-expert');
    const countdown = element('div', 'kv-countdown');
    countdown.style.color = COLORS[body];
    const status = element('div', 'kv-muted');
    root.append(head, values, countdown, status);
    return { root, row: { values, countdown, status }, headText };
  };

  const sunBuilt = buildRow('sun');
  const earthBuilt = buildRow('earth');
  const note = element('div', 'kv-muted kv-sep kv-note kv-expert');
  panel.append(title, canvas, sunBuilt.root, earthBuilt.root, note);
  container.appendChild(panel);

  const getCountdown = (
    body: Body,
    date: Date,
    site: SkySite,
    profile: HorizonProfile | null,
    horizon: HorizonFn,
  ): CountdownCache => {
    const key = `${site.lat}|${site.lon}|${body}`;
    const ms = date.getTime();
    const cached = caches[body];
    if (
      cached &&
      cached.key === key &&
      cached.profile === profile &&
      ms >= cached.from &&
      ms < cached.until
    ) {
      return cached;
    }

    const now = getBodyHorizontal(date, body, site.lat, site.lon);
    const visible = now.elevation > horizon(now.azimuth);
    const next = findNextBodyEvent(
      date,
      body,
      visible ? 'set' : 'rise',
      site.lat,
      site.lon,
      SEARCH_DAYS,
      horizon,
    );
    const fresh: CountdownCache = {
      key,
      profile,
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

  const drawHorizon = (context: CanvasRenderingContext2D, horizon: HorizonFn): void => {
    const c = CHART_SIZE / 2;
    context.beginPath();
    context.arc(c, c, CHART_RADIUS, 0, Math.PI * 2);
    context.closePath();
    for (let az = 0; az < 360; az += HORIZON_STEP_DEG) {
      const [x, y] = project(az, Math.max(horizon(az), 0));
      if (az === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fillStyle = 'rgba(150, 150, 150, 0.55)';
    context.fill('evenodd');
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
    horizonDeg: number,
  ): void => {
    const [x, y] = project(azimuth, elevation);
    const above = elevation > horizonDeg;
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

  const drawChart = (
    date: Date,
    site: SkySite,
    sun: { azimuth: number; elevation: number },
    earth: { azimuth: number; elevation: number },
    profile: HorizonProfile | null,
    horizon: HorizonFn,
  ): void => {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, CHART_SIZE, CHART_SIZE);
    const c = CHART_SIZE / 2;

    ctx.fillStyle = '#050505';
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

    if (profile) drawHorizon(ctx, horizon);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(c, c, CHART_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `700 11px ${CHART_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', c, c - CHART_RADIUS - 8);
    ctx.fillText('S', c, c + CHART_RADIUS + 8);
    ctx.fillText('E', c + CHART_RADIUS + 8, c);
    ctx.fillText(tr('O'), c - CHART_RADIUS - 8, c);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = `9px ${CHART_FONT}`;
    ctx.fillText('30°', c + 3, c - ((90 - 30) / 90) * CHART_RADIUS + 8);
    ctx.fillText('60°', c + 3, c - ((90 - 60) / 90) * CHART_RADIUS + 8);

    drawPath(ctx, 'earth', date, EARTH_PATH_STEPS, EARTH_PATH_STEP_MS, site);
    drawPath(ctx, 'sun', date, SUN_PATH_STEPS, SUN_PATH_STEP_MS, site);
    drawMarker(ctx, 'earth', earth.azimuth, earth.elevation, horizon(earth.azimuth));
    drawMarker(ctx, 'sun', sun.azimuth, sun.elevation, horizon(sun.azimuth));
  };

  const fillRow = (
    row: BodyRow,
    body: Body,
    date: Date,
    site: SkySite,
    h: { azimuth: number; elevation: number },
    profile: HorizonProfile | null,
    horizon: HorizonFn,
  ): void => {
    const cd = getCountdown(body, date, site, profile, horizon);
    const name = tr(body === 'sun' ? 'Sol' : 'Tierra');
    const horizonText = profile ? ` · ${tr('Horizonte')} ${horizon(h.azimuth).toFixed(1)}°` : '';
    row.values.textContent = `${tr('Elevación')} ${h.elevation.toFixed(1)}° · ${tr('Azimut')} ${h.azimuth.toFixed(0)}°${horizonText}`;

    if (cd.next) {
      const remaining = formatRemaining(cd.next.getTime() - date.getTime());
      const label = tr(
        body === 'sun'
          ? cd.visible
            ? 'Puesta de Sol en'
            : 'Amanecer en'
          : cd.visible
            ? 'Puesta de la Tierra en'
            : 'Salida de la Tierra en',
      );
      row.countdown.textContent = `${label} ${remaining}`;
    } else {
      row.countdown.textContent = `${name} ${tr(cd.visible ? 'sobre el horizonte' : 'bajo el horizonte')} ≥ ${SEARCH_DAYS} d`;
    }

    if (body === 'sun') {
      row.status.textContent = tr(cd.visible ? 'Generación solar posible' : 'Sin generación solar');
    } else {
      row.status.textContent = tr(
        cd.visible ? 'Línea de vista directa a la Tierra' : 'Sin línea de vista a la Tierra',
      );
    }
  };

  let lastDate: Date | null = null;
  let disposed = false;

  const update = (date: Date): void => {
    lastDate = date;
    const site = options.getSite();
    const profile = options.getHorizon ? options.getHorizon() : null;
    const horizon = makeHorizonFn(profile);
    panel.setAttribute('aria-label', tr('Posición del Sol y de la Tierra sobre el horizonte'));
    canvas.setAttribute(
      'aria-label',
      tr(
        'Diagrama del cielo visto desde arriba: el centro es el cenit, el borde es el horizonte, el norte arriba y el este a la derecha. La zona gris es el relieve que tapa el cielo.',
      ),
    );
    sunBuilt.headText.textContent = tr('Sol');
    earthBuilt.headText.textContent = tr('Tierra');
    title.textContent = `${tr('Cielo en')} ${siteLabel(site)}`;
    const sun = getBodyHorizontal(date, 'sun', site.lat, site.lon);
    const earth = getBodyHorizontal(date, 'earth', site.lat, site.lon);
    drawChart(date, site, sun, earth, profile, horizon);
    fillRow(sunBuilt.row, 'sun', date, site, sun, profile, horizon);
    fillRow(earthBuilt.row, 'earth', date, site, earth, profile, horizon);
    note.textContent = describeHorizon(profile, site);
  };

  const offLang = onLangChange(() => {
    if (lastDate) update(lastDate);
  });

  if (document.fonts) {
    void document.fonts.ready.then(() => {
      if (!disposed && lastDate) update(lastDate);
    });
  }

  return {
    element: panel,
    update,
    dispose: () => {
      disposed = true;
      offLang();
      panel.remove();
    },
  };
}