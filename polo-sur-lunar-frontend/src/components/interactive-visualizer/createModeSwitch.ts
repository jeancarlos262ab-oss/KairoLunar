import { getMode, onLangChange, setMode, tr, type Mode } from './i18n';
import { element, makeButton } from './ui';

export interface ModeSwitchResult {
  element: HTMLElement;
  dispose: () => void;
}

export function createModeSwitch(container: HTMLElement): ModeSwitchResult {
  const root = element('div', 'kv-mode');
  root.setAttribute('role', 'group');

  const basic = makeButton('', '', 'kv-mode-btn');
  const expert = makeButton('', '', 'kv-mode-btn');
  root.append(basic, expert);
  container.appendChild(root);

  const apply = (): void => {
    const mode = getMode();
    root.setAttribute('aria-label', tr('Modo de visualización'));
    basic.textContent = tr('Básico');
    basic.setAttribute('aria-label', tr('Modo básico: términos sencillos'));
    basic.setAttribute('aria-pressed', String(mode === 'basic'));
    expert.textContent = tr('Experto');
    expert.setAttribute('aria-label', tr('Modo experto: datos técnicos'));
    expert.setAttribute('aria-pressed', String(mode === 'expert'));
    container.classList.toggle('basic', mode === 'basic');
  };

  const choose = (mode: Mode) => (): void => setMode(mode);
  const onBasic = choose('basic');
  const onExpert = choose('expert');
  basic.addEventListener('click', onBasic);
  expert.addEventListener('click', onExpert);

  apply();
  const offLang = onLangChange(apply);

  return {
    element: root,
    dispose: () => {
      offLang();
      basic.removeEventListener('click', onBasic);
      expert.removeEventListener('click', onExpert);
      container.classList.remove('basic');
      root.remove();
    },
  };
}