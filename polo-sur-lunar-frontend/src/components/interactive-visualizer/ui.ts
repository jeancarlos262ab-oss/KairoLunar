export function applyStyles(element: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(element.style, styles);
}

export const PANEL_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'absolute',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '12px 14px',
  background: 'rgba(0,0,0,0.72)',
  border: '1px solid rgba(255,255,255,0.25)',
  borderRadius: '10px',
  color: '#ffffff',
  font: '13px system-ui, sans-serif',
  zIndex: '10',
  boxSizing: 'border-box',
};

export const FIELD_STYLE: Partial<CSSStyleDeclaration> = {
  background: '#111111',
  color: '#ffffff',
  border: '1px solid rgba(255,255,255,0.6)',
  borderRadius: '6px',
  padding: '5px 8px',
  colorScheme: 'dark',
  font: 'inherit',
  boxSizing: 'border-box',
};

export function makeButton(label: string, ariaLabel: string): HTMLButtonElement {
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

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  styles: Partial<CSSStyleDeclaration> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  applyStyles(node, styles);
  if (text !== undefined) node.textContent = text;
  return node;
}