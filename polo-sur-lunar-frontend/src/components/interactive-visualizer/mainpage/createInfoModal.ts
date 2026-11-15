import { getLang, onLangChange, type Lang } from '../i18n';

export interface InfoModalOptions {
  openOnFirstVisit?: boolean;
  storageKey?: string;
}

export interface InfoModalResult {
  open: () => void;
  close: () => void;
  dispose: () => void;
}

interface InfoText {
  button: string;
  title: string;
  thanksTitle: string;
  thanks: string[];
  howTitle: string;
  steps: string[];
  closeLabel: string;
  start: string;
}

const STORAGE_KEY = 'lunar-visualizer:welcome-seen';

const TEXT: Record<Lang, InfoText> = {
  es: {
    button: 'Cómo funciona',
    title: 'Bienvenido a Kairo Lunar',
    thanksTitle: 'Gracias',
    thanks: [
      'Gracias por visitar Kairo Lunar. Este proyecto nace para acercar el polo sur de la Luna a cualquier persona, desde curiosos hasta especialistas.',
      'El relieve que ves proviene de LOLA, el altímetro láser de la nave LRO de la NASA. Tu interés y tus comentarios hacen que siga mejorando.',
    ],
    howTitle: 'Cómo funciona',
    steps: [
      'Arrastra la Luna para girarla. Usa la rueda del ratón o los botones + y − para acercar o alejar.',
      'Busca el punto brillante sobre el polo sur y pulsa «Ver más de cerca» para entrar al terreno en 3D.',
      'Dentro, elige un lugar, el día y la hora, y mira cómo cambian el Sol y la Tierra en el cielo. Puedes alternar entre el modo Básico y el Experto.',
      'Cambia el idioma con EN / ES en la esquina superior derecha. Para volver a la Luna usa el botón de arriba a la derecha.',
    ],
    closeLabel: 'Cerrar',
    start: 'Explorar',
  },
  en: {
    button: 'How it works',
    title: 'Welcome to Kairo Lunar',
    thanksTitle: 'Thank you',
    thanks: [
      'Thank you for visiting Kairo Lunar. This project was created to bring the Moon’s south pole closer to everyone, from the curious to the specialists.',
      'The terrain you see comes from LOLA, the laser altimeter aboard NASA’s LRO spacecraft. Your interest and feedback keep it getting better.',
    ],
    howTitle: 'How it works',
    steps: [
      'Drag the Moon to rotate it. Use the mouse wheel or the + and − buttons to zoom in or out.',
      'Find the bright dot over the south pole and press “View closer” to enter the 3D terrain.',
      'Inside, pick a place, a day and a time, and watch how the Sun and the Earth change in the sky. You can switch between Basic and Expert mode.',
      'Change the language with EN / ES at the top right. To return to the Moon, use the button at the top right.',
    ],
    closeLabel: 'Close',
    start: 'Explore',
  },
};

let instanceCounter = 0;

export function infoButtonLabel(lang: Lang): string {
  return TEXT[lang].button;
}

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string,
): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag);
  if (className) created.className = className;
  if (text !== undefined) created.textContent = text;
  return created;
}

function readSeen(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeSeen(key: string): void {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    return;
  }
}

export function createInfoModal(
  container: HTMLElement,
  options: InfoModalOptions = {},
): InfoModalResult {
  const storageKey = options.storageKey ?? STORAGE_KEY;
  instanceCounter += 1;
  const titleId = `mp-info-title-${instanceCounter}`;

  let isOpen = false;
  let previousFocus: HTMLElement | null = null;

  const overlay = node('div', 'mp-modal');

  const dialog = node('div', 'mp-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', titleId);

  const title = node('h2');
  title.id = titleId;
  const closeX = node('button', 'mp-dialog-x', '✕');
  closeX.type = 'button';
  const top = node('div', 'mp-dialog-top');
  top.append(title, closeX);

  const thanksSection = node('section');
  const thanksTitle = node('h3');
  const thanksBody = node('div');
  thanksSection.append(thanksTitle, thanksBody);

  const howSection = node('section', 'mp-dialog-section');
  const howTitle = node('h3');
  const steps = node('ol');
  howSection.append(howTitle, steps);

  const actions = node('div', 'mp-dialog-actions');
  const start = node('button', 'mp-dialog-go');
  start.type = 'button';
  actions.appendChild(start);

  dialog.append(top, thanksSection, howSection, actions);
  overlay.appendChild(dialog);
  container.appendChild(overlay);

  const render = (): void => {
    const text = TEXT[getLang()];
    title.textContent = text.title;
    closeX.setAttribute('aria-label', text.closeLabel);
    thanksTitle.textContent = text.thanksTitle;
    thanksBody.replaceChildren(...text.thanks.map((line) => node('p', '', line)));
    howTitle.textContent = text.howTitle;
    steps.replaceChildren(...text.steps.map((line) => node('li', '', line)));
    start.textContent = text.start;
  };

  const focusableItems = (): HTMLElement[] => {
    const items: HTMLElement[] = [];
    dialog.querySelectorAll<HTMLElement>('button').forEach((item) => items.push(item));
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
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    render();
    overlay.classList.add('open');
    document.addEventListener('keydown', onKeyDown);
    start.focus();
  }

  function close(): void {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.remove('open');
    writeSeen(storageKey);
    document.removeEventListener('keydown', onKeyDown);
    previousFocus?.focus();
    previousFocus = null;
  }

  const onOverlayClick = (event: MouseEvent): void => {
    if (event.target === overlay) close();
  };

  closeX.addEventListener('click', close);
  start.addEventListener('click', close);
  overlay.addEventListener('click', onOverlayClick);

  render();
  const offLang = onLangChange(render);

  if (options.openOnFirstVisit && !readSeen(storageKey)) open();

  return {
    open,
    close,
    dispose: () => {
      offLang();
      document.removeEventListener('keydown', onKeyDown);
      closeX.removeEventListener('click', close);
      start.removeEventListener('click', close);
      overlay.removeEventListener('click', onOverlayClick);
      overlay.remove();
    },
  };
}