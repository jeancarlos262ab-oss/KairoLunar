import { onLangChange, tr } from '../i18n';
import { element, makeButton } from '../ui';

export interface TutorialStep {
  title: string;
  paragraphs: string[];
}

export interface TutorialModalOptions {
  steps?: TutorialStep[];
  storageKey?: string;
  openOnStart?: boolean;
}

export interface TutorialModalResult {
  open: () => void;
  close: () => void;
  dispose: () => void;
}

const STORAGE_KEY = 'lunar-visualizer:tutorial-dismissed';

const DEFAULT_STEPS: TutorialStep[] = [
  {
    title: 'Elige una misión',
    paragraphs: [
      'Arriba a la izquierda abre «Sitio de aterrizaje» y escoge una misión, como IM-2 o Shackleton. La escena viaja a ese lugar y el módulo vuelve a aterrizar.',
      'También puedes abrir «Coordenadas personalizadas» y escribir cualquier latitud y longitud.',
      'Los sitios de la lista usan datos reales de la NASA (LOLA). Si pones coordenadas fuera de la zona al sur de 80°S, el terreno será de ejemplo.',
    ],
  },
  {
    title: 'Horas de sol y amanecer',
    paragraphs: [
      'En la barra de abajo elige la fecha y la hora (UTC), o pulsa «Reproducir» para ver pasar los días.',
      'Los botones «Amanecer» y «Atardecer» saltan al próximo evento del Sol en ese sitio.',
      'El panel «Sol» indica si hay luz para generar energía y cuánto falta para el siguiente amanecer o puesta. El panel «Tierra» indica si hay línea de vista para comunicarse.',
    ],
  },
  {
    title: 'Qué muestran las coordenadas polares',
    paragraphs: [
      'El círculo del panel «Cielo» es el cielo visto desde arriba: el centro queda justo sobre tu cabeza y el borde es el horizonte.',
      'La dirección alrededor del círculo es el azimut (norte arriba, este a la derecha) y la distancia al centro indica qué tan alto está el astro: la elevación.',
      'El punto amarillo es el Sol y el azul es la Tierra. La zona gris es el relieve que tapa el cielo: si un astro cae ahí, no se ve desde el sitio.',
    ],
  },
];

let instanceCounter = 0;

function readDismissed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(key: string, value: boolean): void {
  try {
    if (value) window.localStorage.setItem(key, '1');
    else window.localStorage.removeItem(key);
  } catch {
    return;
  }
}

export function createTutorialModal(
  container: HTMLElement,
  options: TutorialModalOptions = {},
): TutorialModalResult {
  const steps = options.steps ?? DEFAULT_STEPS;
  const storageKey = options.storageKey ?? STORAGE_KEY;
  instanceCounter += 1;
  const titleId = `tutorial-title-${instanceCounter}`;
  const bodyId = `tutorial-body-${instanceCounter}`;

  let index = 0;
  let isOpen = false;
  let previousFocus: HTMLElement | null = null;

  const helpButton = makeButton('?', '', 'kv-sq kv-help');

  const overlay = element('div', 'kv-modal');

  const dialog = element('div', 'kv-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', titleId);
  dialog.setAttribute('aria-describedby', bodyId);

  const stepLabel = element('div', 'kv-step');
  const closeButton = makeButton('✕', '', 'kv-sq');
  const topRow = element('div', 'kv-dialog-top');
  topRow.append(stepLabel, closeButton);

  const title = element('h2');
  title.id = titleId;

  const body = element('div', 'kv-dialog-body');
  body.id = bodyId;
  body.setAttribute('aria-live', 'polite');

  const dots = steps.map(() => {
    const dot = element('span', 'kv-step-dot');
    dot.setAttribute('aria-hidden', 'true');
    return dot;
  });
  const dotsRow = element('div', 'kv-steps');
  dotsRow.append(...dots);

  const rememberLabel = element('label', 'kv-check');
  const remember = document.createElement('input');
  remember.type = 'checkbox';
  const rememberText = document.createTextNode('');
  rememberLabel.append(remember, rememberText);

  const back = makeButton('', '');
  const next = makeButton('', '', 'kv-btn strong');
  const nav = element('div', 'kv-nav');
  nav.append(back, next);

  const footer = element('div', 'kv-dialog-footer');
  footer.append(rememberLabel, nav);

  dialog.append(topRow, title, body, dotsRow, footer);
  overlay.appendChild(dialog);
  container.append(helpButton, overlay);

  const render = (): void => {
    const step = steps[index];
    const isLast = index === steps.length - 1;
    helpButton.setAttribute('aria-label', tr('Abrir el instructivo'));
    helpButton.title = tr('Cómo usar el visualizador');
    closeButton.setAttribute('aria-label', tr('Cerrar el instructivo'));
    rememberText.textContent = tr('No volver a mostrar al iniciar');
    back.textContent = tr('Atrás');
    back.setAttribute('aria-label', tr('Paso anterior'));
    stepLabel.textContent = `${tr('Paso')} ${index + 1} ${tr('de')} ${steps.length}`;
    title.textContent = tr(step.title);
    body.replaceChildren(...step.paragraphs.map((text) => element('p', '', tr(text))));
    dots.forEach((dot, i) => dot.classList.toggle('on', i === index));
    back.style.visibility = index === 0 ? 'hidden' : 'visible';
    next.textContent = tr(isLast ? 'Empezar' : 'Siguiente');
    next.setAttribute('aria-label', tr(isLast ? 'Cerrar el instructivo y empezar' : 'Paso siguiente'));
  };

  const focusableItems = (): HTMLElement[] => {
    const nodes = dialog.querySelectorAll<HTMLElement>('button, input');
    const items: HTMLElement[] = [];
    nodes.forEach((item) => {
      if (getComputedStyle(item).visibility !== 'hidden') items.push(item);
    });
    return items;
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusableItems();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const outside = !(active instanceof Node) || !dialog.contains(active);
    if (event.shiftKey && (active === first || outside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || outside)) {
      event.preventDefault();
      first.focus();
    }
  };

  function open(): void {
    if (isOpen) return;
    isOpen = true;
    index = 0;
    remember.checked = readDismissed(storageKey);
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlay.classList.add('open');
    render();
    document.addEventListener('keydown', onKeyDown);
    next.focus();
  }

  function close(): void {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.remove('open');
    writeDismissed(storageKey, remember.checked);
    document.removeEventListener('keydown', onKeyDown);
    (previousFocus ?? helpButton).focus();
    previousFocus = null;
  }

  const onNext = (): void => {
    if (index >= steps.length - 1) {
      close();
      return;
    }
    index += 1;
    render();
  };

  const onBack = (): void => {
    if (index === 0) return;
    index -= 1;
    render();
  };

  const onOverlayClick = (event: MouseEvent): void => {
    if (event.target === overlay) close();
  };

  next.addEventListener('click', onNext);
  back.addEventListener('click', onBack);
  closeButton.addEventListener('click', close);
  helpButton.addEventListener('click', open);
  overlay.addEventListener('click', onOverlayClick);

  render();
  const offLang = onLangChange(render);

  if (options.openOnStart !== false && !readDismissed(storageKey)) open();

  const dispose = (): void => {
    offLang();
    document.removeEventListener('keydown', onKeyDown);
    next.removeEventListener('click', onNext);
    back.removeEventListener('click', onBack);
    closeButton.removeEventListener('click', close);
    helpButton.removeEventListener('click', open);
    overlay.removeEventListener('click', onOverlayClick);
    overlay.remove();
    helpButton.remove();
  };

  return { open, close, dispose };
}