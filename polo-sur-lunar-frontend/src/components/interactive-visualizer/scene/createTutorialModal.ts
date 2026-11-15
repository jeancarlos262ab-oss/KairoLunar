import { applyStyles, element, makeButton } from '../ui';

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
      'Arriba a la izquierda abre «Sitio de aterrizaje» y escoge una misión, como IM-2 o Apolo 11. La escena viaja a ese lugar y el módulo vuelve a aterrizar.',
      'También puedes abrir «Coordenadas personalizadas» y escribir cualquier latitud y longitud.',
      'Los sitios cercanos al polo sur usan relieve real medido por la NASA (LOLA); los demás muestran un terreno de ejemplo.',
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

  const helpButton = makeButton('?', 'Abrir el instructivo');
  applyStyles(helpButton, {
    position: 'absolute',
    left: '16px',
    bottom: '16px',
    width: '36px',
    height: '36px',
    padding: '0',
    borderRadius: '50%',
    fontSize: '16px',
    zIndex: '10',
  });
  helpButton.title = 'Cómo usar el visualizador';

  const overlay = element('div', {
    position: 'absolute',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.7)',
    padding: '16px',
    boxSizing: 'border-box',
    zIndex: '100',
  });

  const dialog = element('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    width: '100%',
    maxWidth: '440px',
    maxHeight: '100%',
    overflowY: 'auto',
    padding: '20px 22px',
    background: '#0b1020',
    border: '1px solid rgba(255,255,255,0.35)',
    borderRadius: '12px',
    color: '#ffffff',
    font: '14px/1.5 system-ui, sans-serif',
    boxSizing: 'border-box',
  });
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', titleId);
  dialog.setAttribute('aria-describedby', bodyId);

  const stepLabel = element('div', {
    color: '#9db4ff',
    font: '600 12px system-ui, sans-serif',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  });
  const closeButton = makeButton('✕', 'Cerrar el instructivo');
  applyStyles(closeButton, { padding: '2px 8px' });
  const topRow = element('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  });
  topRow.append(stepLabel, closeButton);

  const title = element('h2', { margin: '0', font: '700 20px system-ui, sans-serif' });
  title.id = titleId;

  const body = element('div', { display: 'flex', flexDirection: 'column', gap: '10px' });
  body.id = bodyId;
  body.setAttribute('aria-live', 'polite');

  const dots = steps.map(() => {
    const dot = element('span', {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      display: 'inline-block',
    });
    dot.setAttribute('aria-hidden', 'true');
    return dot;
  });
  const dotsRow = element('div', { display: 'flex', gap: '6px', justifyContent: 'center' });
  dotsRow.append(...dots);

  const rememberLabel = element('label', {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    color: '#cfcfcf',
    font: '12px system-ui, sans-serif',
    cursor: 'pointer',
  });
  const remember = document.createElement('input');
  remember.type = 'checkbox';
  rememberLabel.append(remember, document.createTextNode('No volver a mostrar al iniciar'));

  const back = makeButton('Atrás', 'Paso anterior');
  const next = makeButton('Siguiente', 'Paso siguiente');
  applyStyles(next, { background: '#ffffff', color: '#000000', borderColor: '#ffffff' });
  const nav = element('div', { display: 'flex', gap: '8px' });
  nav.append(back, next);

  const footer = element('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
  });
  footer.append(rememberLabel, nav);

  dialog.append(topRow, title, body, dotsRow, footer);
  overlay.appendChild(dialog);
  container.append(helpButton, overlay);

  const render = (): void => {
    const step = steps[index];
    const isLast = index === steps.length - 1;
    stepLabel.textContent = `Paso ${index + 1} de ${steps.length}`;
    title.textContent = step.title;
    body.replaceChildren(...step.paragraphs.map((text) => element('p', { margin: '0' }, text)));
    dots.forEach((dot, i) => {
      dot.style.background = i === index ? '#ffffff' : 'rgba(255,255,255,0.3)';
    });
    back.style.visibility = index === 0 ? 'hidden' : 'visible';
    next.textContent = isLast ? 'Empezar' : 'Siguiente';
    next.setAttribute('aria-label', isLast ? 'Cerrar el instructivo y empezar' : 'Paso siguiente');
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
    overlay.style.display = 'flex';
    render();
    document.addEventListener('keydown', onKeyDown);
    next.focus();
  }

  function close(): void {
    if (!isOpen) return;
    isOpen = false;
    overlay.style.display = 'none';
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

  if (options.openOnStart !== false && !readDismissed(storageKey)) open();

  const dispose = (): void => {
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