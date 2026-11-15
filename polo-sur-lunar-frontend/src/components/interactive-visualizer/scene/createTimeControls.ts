import { onLangChange, tr } from '../i18n';
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

  const slider = element('input', 'kv-range');
  slider.type = 'range';
  slider.min = String(-SLIDER_RANGE_HOURS);
  slider.max = String(SLIDER_RANGE_HOURS);
  slider.step = '1';
  slider.value = '0';

  const rowButtons = element('div', 'kv-row');

  const backDay = makeButton('', '');
  const playButton = makeButton('', '');
  const forwardDay = makeButton('', '');
  const sunriseButton = makeButton('', '');
  const sunsetButton = makeButton('', '');

  const speedSelect = element('select', 'kv-field');
  SPEEDS.forEach((speed, index) => {
    const option = document.createElement('option');
    option.value = String(speed.seconds);
    option.textContent = speed.label;
    option.dataset.label = speed.label;
    option.selected = index === DEFAULT_SPEED_INDEX;
    speedSelect.appendChild(option);
  });

  rowButtons.append(backDay, playButton, forwardDay, speedSelect, sunriseButton, sunsetButton);
  panel.append(info, notice, rowInput, slider, rowButtons);
  container.appendChild(panel);

  const applyLang = (): void => {
    panel.setAttribute('aria-label', tr('Control de fecha y hora (UTC)'));
    dateInput.setAttribute('aria-label', tr('Fecha y hora en UTC'));
    dateCaption.textContent = tr('Fecha y hora (UTC)');
    nowButton.textContent = tr('Ahora');
    nowButton.setAttribute('aria-label', tr('Ir a la fecha y hora actuales'));
    slider.setAttribute('aria-label', tr('Desplazamiento en horas respecto a la fecha base'));
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
  };

  const syncUi = (): void => {
    if (document.activeElement !== dateInput) dateInput.value = toInputValue(date);
    let hours = (date.getTime() - anchorMs) / HOUR_MS;
    if (Math.abs(hours) > SLIDER_RANGE_HOURS) {
      anchorMs = date.getTime();
      hours = 0;
    }
    slider.value = String(Math.round(hours));
    playButton.textContent = tr(playing ? '⏸ Pausar' : '▶ Reproducir');
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
      notice.textContent = tr(
        kind === 'sunrise'
          ? 'No hay amanecer en los próximos 32 días en este sitio.'
          : 'No hay atardecer en los próximos 32 días en este sitio.',
      );
    }
  };
  sunriseButton.addEventListener('click', () => jump('sunrise'));
  sunsetButton.addEventListener('click', () => jump('sunset'));

  applyLang();
  syncUi();
  const offLang = onLangChange(applyLang);

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
    dispose: () => {
      offLang();
      panel.remove();
    },
  };
}