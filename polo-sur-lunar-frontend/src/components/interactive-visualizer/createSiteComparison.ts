import { formatCoordinates, type LandingSite } from './sites';
import {
  COMPARISON_DAYS,
  computeSiteMetrics,
  formatDuration,
  type SiteMetrics,
} from './sitesMetrics';
import { applyStyles, element, makeButton, PANEL_STYLE } from './ui';

const MAX_SITES = 4;
const STRIP_HEIGHT = 14;
const BEST_COLOR = '#7cfc9a';
const DAY_MS = 86400000;

interface Entry {
  site: LandingSite;
  metrics: SiteMetrics;
}

interface MetricRow {
  label: string;
  value: (m: SiteMetrics) => number;
  format: (m: SiteMetrics) => string;
  best: 'max' | 'min';
}

const ROWS: MetricRow[] = [
  {
    label: 'Luz solar',
    value: (m) => m.daylightPercent,
    format: (m) => `${m.daylightPercent.toFixed(0)} %`,
    best: 'max',
  },
  {
    label: 'Elevación máx.',
    value: (m) => m.maxElevation,
    format: (m) => `${m.maxElevation.toFixed(1)}°`,
    best: 'max',
  },
  {
    label: 'Día más largo',
    value: (m) => m.longestDayHours,
    format: (m) => formatDuration(m.longestDayHours, m.longestDayOpen),
    best: 'max',
  },
  {
    label: 'Noche más larga',
    value: (m) => m.longestNightHours,
    format: (m) => formatDuration(m.longestNightHours, m.longestNightOpen),
    best: 'min',
  },
  {
    label: 'Energía relativa',
    value: (m) => m.energyIndex,
    format: (m) => `${m.energyIndex.toFixed(1)} %`,
    best: 'max',
  },
];

export interface SiteComparisonOptions {
  getDate: () => Date;
  onSelect: (site: LandingSite) => void;
}

export interface SiteComparisonResult {
  element: HTMLElement;
  addSite: (site: LandingSite) => string | null;
  removeSite: (id: string) => void;
  refresh: () => void;
  setCursorDate: (date: Date) => void;
  getSites: () => LandingSite[];
  dispose: () => void;
}

function stripColor(elevation: number): string {
  if (elevation <= 0) return '#0b0b0b';
  const t = Math.min(elevation / 20, 1);
  const r = Math.round(90 + 165 * t);
  const g = Math.round(70 + 150 * t);
  const b = Math.round(20 + 100 * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function drawStrip(canvas: HTMLCanvasElement, metrics: SiteMetrics): void {
  canvas.width = metrics.elevations.length;
  canvas.height = STRIP_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  for (let i = 0; i < metrics.elevations.length; i++) {
    ctx.fillStyle = stripColor(metrics.elevations[i]);
    ctx.fillRect(i, 0, 1, STRIP_HEIGHT);
  }
}

function bestIndex(entries: Entry[], row: MetricRow): number {
  if (entries.length < 2) return -1;
  const values = entries.map((e) => row.value(e.metrics));
  const target = row.best === 'max' ? Math.max(...values) : Math.min(...values);
  const spread = Math.max(...values) - Math.min(...values);
  if (spread < 1e-6) return -1;
  return values.indexOf(target);
}

export function createSiteComparison(
  container: HTMLElement,
  options: SiteComparisonOptions,
): SiteComparisonResult {
  const entries: Entry[] = [];
  let windowStart: Date | null = null;
  let cursor: HTMLElement | null = null;

  const panel = element('div', {
    ...PANEL_STYLE,
    top: '16px',
    right: '16px',
    width: 'min(520px, calc(100% - 32px))',
    maxHeight: 'calc(100% - 210px)',
    overflowY: 'auto',
    display: 'none',
  });
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Comparación de sitios');
  container.appendChild(panel);

  const recompute = (): void => {
    if (!windowStart) return;
    const start = windowStart;
    entries.forEach((entry) => {
      entry.metrics = computeSiteMetrics(entry.site.lat, entry.site.lon, start);
    });
  };

  const render = (): void => {
    panel.replaceChildren();
    cursor = null;
    if (entries.length === 0 || !windowStart) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = 'flex';

    const header = element('div', {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '8px',
      flexWrap: 'wrap',
    });
    const title = element(
      'div',
      { fontWeight: '700' },
      `Comparación · ${COMPARISON_DAYS} días desde ${windowStart.toISOString().slice(0, 10)} UTC`,
    );
    const actions = element('div', { display: 'flex', gap: '6px' });
    const refreshButton = makeButton('↻ Desde la fecha actual', 'Recalcular desde la fecha actual');
    const clearButton = makeButton('Vaciar', 'Quitar todos los sitios de la comparación');
    refreshButton.addEventListener('click', refresh);
    clearButton.addEventListener('click', () => {
      entries.length = 0;
      windowStart = null;
      render();
    });
    actions.append(refreshButton, clearButton);
    header.append(title, actions);

    const table = element('table', { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' });
    const head = element('tr');
    head.appendChild(element('th', { width: '28%' }));

    entries.forEach((entry) => {
      const th = element('th', { padding: '4px', verticalAlign: 'top', textAlign: 'center' });
      th.scope = 'col';
      const viewButton = makeButton(entry.site.name, `Ver ${entry.site.name} en el visualizador`);
      applyStyles(viewButton, {
        width: '100%',
        padding: '4px 6px',
        fontSize: '12px',
        whiteSpace: 'normal',
      });
      viewButton.addEventListener('click', () => options.onSelect(entry.site));
      const coords = element(
        'div',
        { fontWeight: '400', color: '#bbbbbb', fontSize: '11px', margin: '3px 0' },
        formatCoordinates(entry.site.lat, entry.site.lon),
      );
      const removeButton = makeButton('✕', `Quitar ${entry.site.name} de la comparación`);
      applyStyles(removeButton, { padding: '1px 8px', fontSize: '11px' });
      removeButton.addEventListener('click', () => removeSite(entry.site.id));
      th.append(viewButton, coords, removeButton);
      head.appendChild(th);
    });
    table.appendChild(head);

    ROWS.forEach((row) => {
      const tr = element('tr', { borderTop: '1px solid rgba(255,255,255,0.15)' });
      const rowHead = element('th', { textAlign: 'left', padding: '6px 4px', fontWeight: '600' }, row.label);
      rowHead.scope = 'row';
      tr.appendChild(rowHead);
      const best = bestIndex(entries, row);
      entries.forEach((entry, index) => {
        const td = element(
          'td',
          {
            textAlign: 'center',
            padding: '6px 4px',
            color: index === best ? BEST_COLOR : '#ffffff',
            fontWeight: index === best ? '700' : '400',
          },
          row.format(entry.metrics),
        );
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });

    const stripsTitle = element('div', { fontWeight: '600', marginTop: '4px' }, 'Línea de tiempo de iluminación');
    const strips = element('div', { position: 'relative', display: 'flex', flexDirection: 'column', gap: '6px' });
    entries.forEach((entry) => {
      const row = element('div');
      row.appendChild(element('div', { fontSize: '11px', color: '#cfcfcf', marginBottom: '2px' }, entry.site.name));
      const canvas = element('canvas', {
        width: '100%',
        height: `${STRIP_HEIGHT}px`,
        display: 'block',
        borderRadius: '3px',
      });
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `Iluminación solar de ${entry.site.name} durante ${COMPARISON_DAYS} días`);
      drawStrip(canvas, entry.metrics);
      row.appendChild(canvas);
      strips.appendChild(row);
    });
    cursor = element('div', {
      position: 'absolute',
      top: '0',
      bottom: '0',
      width: '2px',
      background: '#ffffff',
      pointerEvents: 'none',
      display: 'none',
    });
    strips.appendChild(cursor);

    const legend = element(
      'div',
      { fontSize: '11px', color: '#bbbbbb', lineHeight: '1.4' },
      'Amarillo: Sol sobre el horizonte · Negro: noche · Línea blanca: fecha actual. Horizonte esférico, sin relieve local. En verde, el mejor valor de cada fila.',
    );

    panel.append(header, table, stripsTitle, strips, legend);
    setCursorDate(options.getDate());
  };

  const setCursorDate = (date: Date): void => {
    if (!cursor || !windowStart) return;
    const fraction = (date.getTime() - windowStart.getTime()) / (COMPARISON_DAYS * DAY_MS);
    if (fraction < 0 || fraction > 1) {
      cursor.style.display = 'none';
      return;
    }
    cursor.style.display = 'block';
    cursor.style.left = `${fraction * 100}%`;
  };

  const addSite = (site: LandingSite): string | null => {
    if (entries.some((entry) => entry.site.id === site.id)) {
      return 'Ese sitio ya está en la comparación.';
    }
    if (entries.length >= MAX_SITES) {
      return `La comparación admite hasta ${MAX_SITES} sitios.`;
    }
    if (!windowStart) windowStart = new Date(options.getDate().getTime());
    entries.push({ site, metrics: computeSiteMetrics(site.lat, site.lon, windowStart) });
    render();
    return null;
  };

  const removeSite = (id: string): void => {
    const index = entries.findIndex((entry) => entry.site.id === id);
    if (index >= 0) entries.splice(index, 1);
    if (entries.length === 0) windowStart = null;
    render();
  };

  const refresh = (): void => {
    if (entries.length === 0) return;
    windowStart = new Date(options.getDate().getTime());
    recompute();
    render();
  };

  return {
    element: panel,
    addSite,
    removeSite,
    refresh,
    setCursorDate,
    getSites: () => entries.map((entry) => entry.site),
    dispose: () => panel.remove(),
  };
}