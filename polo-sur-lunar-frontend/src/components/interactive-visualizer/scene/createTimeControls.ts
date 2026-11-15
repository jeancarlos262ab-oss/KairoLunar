import { element, makeButton } from '../ui';

export type TimeEventKind = 'sunrise' | 'sunset';

export interface TimeControlsOptions {
  initialDate: Date;
  onChange: (date: Date) => void;
  findEvent: (kind: TimeEventKind, from: Date) => Date | null;
}

export interface TimeControlsResult {
  element: HTMLElement;
  getDate: () => Date;
  setDate: (date: Date) => void;
  setInfo: (text: string) => void;
  tick: (deltaSeconds: number) => void;
  dispose: () => void;
}

const SPEEDS = [
  { label: '1 h/s', seconds: 3600 },
  { label: '6 h/s', seconds: 21600 },
  { label: '1 día/s', seconds: 86400 },
  { label: '3 días/s', seconds: 259200 },
  { label: '7 días/s', seconds: 604800 },
];
const DEFAULT_SPEED_INDEX = 2;
const SLIDER_RANGE_HOURS = 360;
const HOUR_MS = 3600000;
const DAY_MS = 86400000;

function toInputValue(date: Date): string {
  return date.toISOString().slice(0, 16);
}

export function createTimeControls(
  container: HTMLElement,
  options: TimeControlsOptions,
): TimeControlsResult {
  let date = new Date(options.initialDate.getTime());
  let anchorMs = date.getTime();
  let playing = false;
  let speedSeconds = SPEEDS[DEFAULT_SPEED_INDEX].seconds;

  const panel = element('div', 'kv-panel kv-time');
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Control de fecha y hora (UTC)');

  const info = element('div', 'kv-info');

  const notice = element('div', 'kv-notice');
  notice.setAttribute('aria-live', 'polite');

  const rowInput = element('div', 'kv-row');

  const dateLabel = element('label', 'kv-row');
  const dateInput = element('input', 'kv-field');
  dateInput.type = 'datetime-local';
  dateInput.setAttribute('aria-label', 'Fecha y hora en UTC');
  dateLabel.append(element('span', 'kv-muted', 'Fecha y hora (UTC)'), dateInput);

  const nowButton = makeButton('Ahora', 'Ir a la fecha y hora actuales');
  rowInput.append(dateLabel, nowButton);

  const slider = element('input', 'kv-range');
  slider.type = 'range';
  slider.min = String(-SLIDER_RANGE_HOURS);
  slider.max = String(SLIDER_RANGE_HOURS);
  slider.step = '1';
  slider.value = '0';
  slider.setAttribute('aria-label', 'Desplazamiento en horas respecto a la fecha base');

  const rowButtons = element('div', 'kv-row');

  const backDay = makeButton('−1 día', 'Retroceder un día');
  const playButton = makeButton('▶ Reproducir', 'Reproducir o pausar la animación');
  const forwardDay = makeButton('+1 día', 'Avanzar un día');
  const sunriseButton = makeButton('☀↑ Amanecer', 'Ir al siguiente amanecer');
  const sunsetButton = makeButton('☀↓ Atardecer', 'Ir al siguiente atardecer');

  const speedSelect = element('select', 'kv-field');
  speedSelect.setAttribute('aria-label', 'Velocidad de la animación');
  SPEEDS.forEach((speed, index) => {
    const option = document.createElement('option');
    option.value = String(speed.seconds);
    option.textContent = speed.label;
    option.selected = index === DEFAULT_SPEED_INDEX;
    speedSelect.appendChild(option);
  });

  rowButtons.append(backDay, playButton, forwardDay, speedSelect, sunriseButton, sunsetButton);
  panel.append(info, notice, rowInput, slider, rowButtons);
  container.appendChild(panel);

  const syncUi = (): void => {
    if (document.activeElement !== dateInput) dateInput.value = toInputValue(date);
    let hours = (date.getTime() - anchorMs) / HOUR_MS;
    if (Math.abs(hours) > SLIDER_RANGE_HOURS) {
      anchorMs = date.getTime();
      hours = 0;
    }
    slider.value = String(Math.round(hours));
    playButton.textContent = playing ? '⏸ Pausar' : '▶ Reproducir';
    playButton.setAttribute('aria-pressed', String(playing));
  };

  const commit = (next: Date, reanchor: boolean): void => {
    date = next;
    if (reanchor) anchorMs = next.getTime();
    notice.textContent = '';
    syncUi();
    options.onChange(date);
  };

  const stopAndCommit = (next: Date, reanchor: boolean): void => {
    playing = false;
    commit(next, reanchor);
  };

  dateInput.addEventListener('change', () => {
    const ms = Date.parse(`${dateInput.value}:00Z`);
    if (Number.isFinite(ms)) stopAndCommit(new Date(ms), true);
  });

  slider.addEventListener('input', () => {
    playing = false;
    commit(new Date(anchorMs + Number(slider.value) * HOUR_MS), false);
  });

  nowButton.addEventListener('click', () => stopAndCommit(new Date(), true));
  backDay.addEventListener('click', () => stopAndCommit(new Date(date.getTime() - DAY_MS), false));
  forwardDay.addEventListener('click', () => stopAndCommit(new Date(date.getTime() + DAY_MS), false));

  playButton.addEventListener('click', () => {
    playing = !playing;
    syncUi();
  });

  speedSelect.addEventListener('change', () => {
    speedSeconds = Number(speedSelect.value);
  });

  const jump = (kind: TimeEventKind): void => {
    const found = options.findEvent(kind, date);
    if (found) {
      stopAndCommit(found, false);
    } else {
      playing = false;
      syncUi();
      notice.textContent = `No hay ${kind === 'sunrise' ? 'amanecer' : 'atardecer'} en los próximos 32 días en este sitio.`;
    }
  };
  sunriseButton.addEventListener('click', () => jump('sunrise'));
  sunsetButton.addEventListener('click', () => jump('sunset'));

  syncUi();

  return {
    element: panel,
    getDate: () => new Date(date.getTime()),
    setDate: (next) => commit(new Date(next.getTime()), true),
    setInfo: (text) => {
      info.textContent = text;
    },
    tick: (deltaSeconds) => {
      if (!playing) return;
      commit(new Date(date.getTime() + speedSeconds * deltaSeconds * 1000), false);
    },
    dispose: () => panel.remove(),
  };
}