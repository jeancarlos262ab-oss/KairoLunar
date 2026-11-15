import { getLang, onLangChange, tr } from '../i18n';
import { element, makeButton } from '../ui';

export type TimeEventKind = 'sunrise' | 'sunset';
export type SunSampler = (date: Date) => boolean;

export interface TimeControlsOptions {
  initialDate: Date;
  onChange: (date: Date) => void;
  findEvent: (kind: TimeEventKind, from: Date) => Date | null;
  getSunSampler?: () => SunSampler;
}

export interface TimeControlsResult {
  element: HTMLElement;
  getDate: () => Date;
  setDate: (date: Date) => void;
  setInfo: (text: string) => void;
  tick: (deltaSeconds: number) => void;
  refreshTimeline: () => void;
  dispose: () => void;
}

const SPEEDS = [
  { label: '1 h/s', seconds: 3600 },
  { label: '6 h/s', seconds: 21600 },
  { label: '1 día/s', seconds: 86400 },
  { label: '3 días/s', seconds: 259200 },
  { label: '7 días/s', seconds: 604800 },
];
const SPANS = [
  { label: '1 día lunar (29,5 d)', days: 29.530588 },
  { label: '3 meses (91 d)', days: 91 },
  { label: '1 año (365 d)', days: 365 },
];
const DEFAULT_SPEED_INDEX = 2;
const DEFAULT_SPAN_INDEX = 0;
const STRIP_WIDTH = 720;
const STRIP_HEIGHT = 12;
const LIT_COLOR = '#ffd24a';
const NIGHT_COLOR = '#141414';
const HOUR_MS = 3600000;
const DAY_MS = 86400000;

function toInputValue(date: Date): string {
  return date.toISOString().slice(0, 16);
}

function toDayLabel(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function floorDay(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

export function createTimeControls(
  container: HTMLElement,
  options: TimeControlsOptions,
): TimeControlsResult {
  let date = new Date(options.initialDate.getTime());
  let rangeStart = floorDay(date.getTime());
  let spanMs = SPANS[DEFAULT_SPAN_INDEX].days * DAY_MS;
  let playing = false;
  let speedSeconds = SPEEDS[DEFAULT_SPEED_INDEX].seconds;

  const rangeEnd = (): number => rangeStart + spanMs;
  const clampMs = (ms: number): number => Math.min(Math.max(ms, rangeStart), rangeEnd());

  const panel = element('div', 'kv-panel kv-time');
  panel.setAttribute('role', 'group');

  const info = element('div', 'kv-info');

  const notice = element('div', 'kv-notice');
  notice.setAttribute('aria-live', 'polite');

  const rowInput = element('div', 'kv-row');

  const dateLabel = element('label', 'kv-row');
  const dateInput = element('input', 'kv-field');
  dateInput.type = 'datetime-local';
  const dateCaption = element('span', 'kv-muted');
  dateLabel.append(dateCaption, dateInput);

  const nowButton = makeButton('', '');
  rowInput.append(dateLabel, nowButton);

  const rowRange = element('div', 'kv-row kv-expert');

  const startLabel = element('label', 'kv-row');
  const startInput = element('input', 'kv-field');
  startInput.type = 'datetime-local';
  const startCaption = element('span', 'kv-muted');
  startLabel.append(startCaption, startInput);

  const spanLabel = element('label', 'kv-row');
  const spanSelect = element('select', 'kv-field');
  const spanCaption = element('span', 'kv-muted');
  SPANS.forEach((span, index) => {
    const option = document.createElement('option');
    option.value = String(span.days);
    option.textContent = span.label;
    option.dataset.label = span.label;
    option.selected = index === DEFAULT_SPAN_INDEX;
    spanSelect.appendChild(option);
  });
  spanLabel.append(spanCaption, spanSelect);
  rowRange.append(startLabel, spanLabel);

  const strip = element('canvas', 'kv-strip');
  strip.width = STRIP_WIDTH;
  strip.height = STRIP_HEIGHT;
  strip.setAttribute('role', 'img');
  const stripCtx = strip.getContext('2d');

  const slider = element('input', 'kv-range');
  slider.type = 'range';
  slider.min = '0';
  slider.step = '1';
  slider.value = '0';

  const axis = element('div', 'kv-axis');
  const startText = element('span');
  const endText = element('span');
  const legend = element('span', 'kv-legend');
  const litSwatch = element('i', 'kv-swatch');
  litSwatch.style.background = LIT_COLOR;
  const nightSwatch = element('i', 'kv-swatch');
  nightSwatch.style.background = NIGHT_COLOR;
  const litText = document.createTextNode('');
  const nightText = document.createTextNode('');
  legend.append(litSwatch, litText, nightSwatch, nightText);
  axis.append(startText, legend, endText);

  const summary = element('div', 'kv-muted');
  let litPercent = 0;
  let longestNightHours = 0;

  const formatLongest = (hours: number): string => {
    const value = hours >= 24 ? `${(hours / 24).toFixed(1)} d` : `${hours} h`;
    return getLang() === 'es' ? value.replace('.', ',') : value;
  };

  const renderSummary = (): void => {
    summary.textContent = `${tr('Con luz del Sol')}: ${litPercent} % · ${tr('Noche continua más larga')}: ${formatLongest(longestNightHours)}`;
  };

  const rowButtons = element('div', 'kv-row');

  const backDay = makeButton('', '');
  const playButton = makeButton('', '');
  const forwardDay = makeButton('', '');
  const sunriseButton = makeButton('', '');
  const sunsetButton = makeButton('', '');

  const speedSelect = element('select', 'kv-field kv-expert');
  SPEEDS.forEach((speed, index) => {
    const option = document.createElement('option');
    option.value = String(speed.seconds);
    option.textContent = speed.label;
    option.dataset.label = speed.label;
    option.selected = index === DEFAULT_SPEED_INDEX;
    speedSelect.appendChild(option);
  });

  rowButtons.append(backDay, playButton, forwardDay, speedSelect, sunriseButton, sunsetButton);
  panel.append(info, notice, rowInput, rowRange, strip, slider, axis, summary, rowButtons);
  container.appendChild(panel);

  const drawTimeline = (): void => {
    if (!stripCtx) return;
    const sampler = options.getSunSampler ? options.getSunSampler() : null;
    stripCtx.clearRect(0, 0, STRIP_WIDTH, STRIP_HEIGHT);
    for (let i = 0; i < STRIP_WIDTH; i++) {
      const ms = rangeStart + ((i + 0.5) / STRIP_WIDTH) * spanMs;
      const lit = sampler ? sampler(new Date(ms)) : false;
      stripCtx.fillStyle = lit ? LIT_COLOR : NIGHT_COLOR;
      stripCtx.fillRect(i, 0, 1, STRIP_HEIGHT);
    }
    const steps = Math.max(1, Math.floor(spanMs / HOUR_MS));
    let lit = 0;
    let run = 0;
    let longest = 0;
    if (sampler) {
      for (let i = 0; i < steps; i++) {
        if (sampler(new Date(rangeStart + i * HOUR_MS))) {
          lit++;
          run = 0;
        } else {
          run++;
          if (run > longest) longest = run;
        }
      }
    }
    litPercent = Math.round((lit / steps) * 100);
    longestNightHours = longest;
    renderSummary();
  };

  const applyRangeText = (): void => {
    startText.textContent = `${tr('Inicio')} ${toDayLabel(rangeStart)}`;
    endText.textContent = `${tr('Fin')} ${toDayLabel(rangeEnd())}`;
  };

  const applyRange = (): void => {
    slider.max = String(Math.max(1, Math.floor(spanMs / HOUR_MS)));
    if (document.activeElement !== startInput) startInput.value = toInputValue(new Date(rangeStart));
    applyRangeText();
    drawTimeline();
  };

  const applyLang = (): void => {
    panel.setAttribute('aria-label', tr('Control de fecha y hora (UTC)'));
    dateInput.setAttribute('aria-label', tr('Fecha y hora en UTC'));
    dateCaption.textContent = tr('Fecha y hora (UTC)');
    startInput.setAttribute('aria-label', tr('Inicio del rango en UTC'));
    startCaption.textContent = tr('Inicio (UTC)');
    spanSelect.setAttribute('aria-label', tr('Duración del rango'));
    spanCaption.textContent = tr('Duración del rango');
    spanSelect.querySelectorAll<HTMLOptionElement>('option').forEach((option) => {
      option.textContent = tr(option.dataset.label ?? '');
    });
    strip.setAttribute('aria-label', tr('Franja de día y noche a lo largo del rango'));
    slider.setAttribute('aria-label', tr('Hora dentro del rango seleccionado'));
    litText.textContent = ` ${tr('Con luz del Sol')}   `;
    nightText.textContent = ` ${tr('Noche')}`;
    nowButton.textContent = tr('Ahora');
    nowButton.setAttribute('aria-label', tr('Ir a la fecha y hora actuales'));
    backDay.textContent = tr('−1 día');
    backDay.setAttribute('aria-label', tr('Retroceder un día'));
    playButton.setAttribute('aria-label', tr('Reproducir o pausar la animación'));
    forwardDay.textContent = tr('+1 día');
    forwardDay.setAttribute('aria-label', tr('Avanzar un día'));
    sunriseButton.textContent = tr('☀↑ Amanecer');
    sunriseButton.setAttribute('aria-label', tr('Ir al siguiente amanecer'));
    sunsetButton.textContent = tr('☀↓ Atardecer');
    sunsetButton.setAttribute('aria-label', tr('Ir al siguiente atardecer'));
    speedSelect.setAttribute('aria-label', tr('Velocidad de la animación'));
    speedSelect.querySelectorAll<HTMLOptionElement>('option').forEach((option) => {
      option.textContent = tr(option.dataset.label ?? '');
    });
    notice.textContent = '';
    playButton.textContent = tr(playing ? '⏸ Pausar' : '▶ Reproducir');
    renderSummary();
    applyRangeText();
  };

  const syncUi = (): void => {
    if (document.activeElement !== dateInput) dateInput.value = toInputValue(date);
    const hours = Math.round((date.getTime() - rangeStart) / HOUR_MS);
    slider.value = String(Math.min(Math.max(hours, 0), Number(slider.max)));
    playButton.textContent = tr(playing ? '⏸ Pausar' : '▶ Reproducir');
    playButton.setAttribute('aria-pressed', String(playing));
  };

  const commit = (next: Date): void => {
    date = next;
    notice.textContent = '';
    syncUi();
    options.onChange(date);
  };

  const stopAndCommit = (next: Date): void => {
    playing = false;
    commit(next);
  };

  const placeInRange = (ms: number): Date => {
    if (ms < rangeStart || ms > rangeEnd()) {
      rangeStart = floorDay(ms);
      applyRange();
    }
    return new Date(ms);
  };

  dateInput.addEventListener('change', () => {
    const ms = Date.parse(`${dateInput.value}:00Z`);
    if (Number.isFinite(ms)) stopAndCommit(placeInRange(ms));
  });

  startInput.addEventListener('change', () => {
    const ms = Date.parse(`${startInput.value}:00Z`);
    if (!Number.isFinite(ms)) return;
    rangeStart = ms;
    applyRange();
    stopAndCommit(new Date(clampMs(date.getTime())));
  });

  spanSelect.addEventListener('change', () => {
    spanMs = Number(spanSelect.value) * DAY_MS;
    applyRange();
    stopAndCommit(new Date(clampMs(date.getTime())));
  });

  slider.addEventListener('input', () => {
    stopAndCommit(new Date(rangeStart + Number(slider.value) * HOUR_MS));
  });

  nowButton.addEventListener('click', () => stopAndCommit(placeInRange(Date.now())));
  backDay.addEventListener('click', () => stopAndCommit(new Date(clampMs(date.getTime() - DAY_MS))));
  forwardDay.addEventListener('click', () => stopAndCommit(new Date(clampMs(date.getTime() + DAY_MS))));

  playButton.addEventListener('click', () => {
    playing = !playing;
    syncUi();
  });

  speedSelect.addEventListener('change', () => {
    speedSeconds = Number(speedSelect.value);
  });

  const jump = (kind: TimeEventKind): void => {
    const found = options.findEvent(kind, date);
    playing = false;
    if (!found) {
      syncUi();
      notice.textContent = tr(
        kind === 'sunrise'
          ? 'No hay amanecer en los próximos 32 días en este sitio.'
          : 'No hay atardecer en los próximos 32 días en este sitio.',
      );
      return;
    }
    if (found.getTime() > rangeEnd()) {
      syncUi();
      notice.textContent = tr(
        kind === 'sunrise'
          ? 'El próximo amanecer queda fuera del rango.'
          : 'El próximo atardecer queda fuera del rango.',
      );
      return;
    }
    commit(found);
  };
  sunriseButton.addEventListener('click', () => jump('sunrise'));
  sunsetButton.addEventListener('click', () => jump('sunset'));

  applyRange();
  applyLang();
  syncUi();
  const offLang = onLangChange(applyLang);

  return {
    element: panel,
    getDate: () => new Date(date.getTime()),
    setDate: (next) => commit(placeInRange(next.getTime())),
    setInfo: (text) => {
      info.textContent = text;
    },
    tick: (deltaSeconds) => {
      if (!playing) return;
      let nextMs = date.getTime() + speedSeconds * deltaSeconds * 1000;
      if (nextMs >= rangeEnd()) nextMs = rangeStart + ((nextMs - rangeStart) % spanMs);
      commit(new Date(nextMs));
    },
    refreshTimeline: drawTimeline,
    dispose: () => {
      offLang();
      panel.remove();
    },
  };
}