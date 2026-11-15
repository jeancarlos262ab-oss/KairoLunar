import './visualizer.css';

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function makeButton(
  label: string,
  ariaLabel: string,
  className = 'kv-btn',
): HTMLButtonElement {
  const button = element('button', className, label);
  button.type = 'button';
  button.setAttribute('aria-label', ariaLabel);
  return button;
}