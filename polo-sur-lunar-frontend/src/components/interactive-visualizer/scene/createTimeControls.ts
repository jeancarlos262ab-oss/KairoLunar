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

function applyStyles(element: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(element.style, styles);
}

function makeButton(label: string, ariaLabel: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('aria-label', ariaLabel);
  applyStyles(button, {
    padding: '6px 12px',
    border: '1px solid rgba(255,255,255,0.6)',
    borderRadius: '6px',
    background: 'rgba(0,0,0,0.5)',
    color: '#ffffff',
    font: '600 13px system-ui, sans-serif',
    cursor: 'pointer',
  });
  return button;
}

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

  const panel = document.createElement('div');
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Control de fecha y hora (UTC)');
  applyStyles(panel, {
    position: 'absolute',
    bottom: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: 'min(640px, calc(100% - 32px))',
    padding: '12px 14px',
    background: 'rgba(0,0,0,0.72)',
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: '10px',
    color: '#ffffff',
    font: '13px system-ui, sans-serif',
    zIndex: '10',
    boxSizing: 'border-box',
  });

  const info = document.createElement('div');
  applyStyles(info, { fontWeight: '600', lineHeight: '1.4' });

  const notice = document.createElement('div');
  applyStyles(notice, { color: '#ffd166', minHeight: '1em' });
  notice.setAttribute('aria-live', 'polite');

  const rowInput = document.createElement('div');
  applyStyles(rowInput, { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' });

  const dateLabel = document.createElement('label');
  dateLabel.textContent = 'Fecha y hora (UTC)';
  applyStyles(dateLabel, { display: 'flex', gap: '8px', alignItems: 'center' });

  const dateInput = document.createElement('input');
  dateInput.type = 'datetime-local';
  dateInput.setAttribute('aria-label', 'Fecha y hora en UTC');
  applyStyles(dateInput, {
    background: '#111111',
    color: '#ffffff',
    border: '1px solid rgba(255,255,255,0.6)',
    borderRadius: '6px',
    padding: '4px 8px',
    colorScheme: 'dark',
  });
  dateLabel.appendChild(dateInput);

  const nowButton = makeButton('Ahora', 'Ir a la fecha y hora actuales');
  rowInput.append(dateLabel, nowButton);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(-SLIDER_RANGE_HOURS);
  slider.max = String(SLIDER_RANGE_HOURS);
  slider.step = '1';
  slider.value = '0';
  slider.setAttribute('aria-label', 'Desplazamiento en horas respecto a la fecha base');
  applyStyles(slider, { width: '100%' });

  const rowButtons = document.createElement('div');
  applyStyles(rowButtons, { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' });

  const backDay = makeButton('−1 día', 'Retroceder un día');
  const playButton = makeButton('▶ Reproducir', 'Reproducir o pausar la animación');
  const forwardDay = makeButton('+1 día', 'Avanzar un día');
  const sunriseButton = makeButton('☀↑ Amanecer', 'Ir al siguiente amanecer');
  const sunsetButton = makeButton('☀↓ Atardecer', 'Ir al siguiente atardecer');

  const speedSelect = document.createElement('select');
  speedSelect.setAttribute('aria-label', 'Velocidad de la animación');
  applyStyles(speedSelect, {
    background: '#111111',
    color: '#ffffff',
    border: '1px solid rgba(255,255,255,0.6)',
    borderRadius: '6px',
    padding: '5px 8px',
    colorScheme: 'dark',
  });
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