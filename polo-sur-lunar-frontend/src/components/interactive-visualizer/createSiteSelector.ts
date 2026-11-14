import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  describeSite,
  parseCustomSite,
  type LandingSite,
  type SiteCategory,
} from './sites';
import { element, FIELD_STYLE, makeButton, PANEL_STYLE } from './ui';

export interface SiteSelectorOptions {
  sites: LandingSite[];
  initialSiteId: string;
  onSelect: (site: LandingSite) => void;
}

export interface SiteSelectorResult {
  element: HTMLElement;
  getSite: () => LandingSite;
  setSite: (site: LandingSite, notify?: boolean) => void;
  dispose: () => void;
}

export function createSiteSelector(
  container: HTMLElement,
  options: SiteSelectorOptions,
): SiteSelectorResult {
  const siteMap = new Map<string, LandingSite>();
  const groups = new Map<SiteCategory, HTMLOptGroupElement>();
  let current: LandingSite = options.sites.find((s) => s.id === options.initialSiteId) ?? options.sites[0];

  const panel = element('div', {
    ...PANEL_STYLE,
    top: '16px',
    left: '16px',
    width: 'min(300px, calc(50% - 90px))',
    minWidth: '240px',
  });
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Selección de sitio de aterrizaje');

  const label = element('label', { display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: '600' }, 'Sitio de aterrizaje');
  const select = element('select', { ...FIELD_STYLE, width: '100%' });
  select.setAttribute('aria-label', 'Sitio de aterrizaje');
  label.appendChild(select);

  const details = element('div', { color: '#cfcfcf', lineHeight: '1.4' });

  const customBox = element('details', { borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '8px' });
  const summary = element('summary', { cursor: 'pointer', fontWeight: '600' }, 'Coordenadas personalizadas');
  const customBody = element('div', { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' });

  const latInput = element('input', { ...FIELD_STYLE, width: '100%' });
  latInput.type = 'text';
  latInput.inputMode = 'decimal';
  latInput.placeholder = 'Latitud (−90 a 90), p. ej. −85.5';
  latInput.setAttribute('aria-label', 'Latitud en grados');

  const lonInput = element('input', { ...FIELD_STYLE, width: '100%' });
  lonInput.type = 'text';
  lonInput.inputMode = 'decimal';
  lonInput.placeholder = 'Longitud (−180 a 360), p. ej. 31.2';
  lonInput.setAttribute('aria-label', 'Longitud este en grados');

  const nameInput = element('input', { ...FIELD_STYLE, width: '100%' });
  nameInput.type = 'text';
  nameInput.placeholder = 'Nombre (opcional)';
  nameInput.setAttribute('aria-label', 'Nombre del sitio personalizado');

  const useButton = makeButton('Usar estas coordenadas', 'Usar las coordenadas ingresadas');
  const customError = element('div', { color: '#ff6b6b', minHeight: '1em' });
  customError.setAttribute('aria-live', 'polite');

  customBody.append(latInput, lonInput, nameInput, useButton, customError);
  customBox.append(summary, customBody);
  panel.append(label, details, customBox);
  container.appendChild(panel);

  const addOption = (site: LandingSite): void => {
    siteMap.set(site.id, site);
    let group = groups.get(site.category);
    if (!group) {
      group = document.createElement('optgroup');
      group.label = CATEGORY_LABELS[site.category];
      groups.set(site.category, group);
      const index = CATEGORY_ORDER.indexOf(site.category);
      const next = CATEGORY_ORDER.slice(index + 1)
        .map((category) => groups.get(category))
        .find((g): g is HTMLOptGroupElement => g !== undefined);
      if (next) select.insertBefore(group, next);
      else select.appendChild(group);
    }
    const option = document.createElement('option');
    option.value = site.id;
    option.textContent = site.name;
    group.appendChild(option);
  };

  options.sites.forEach(addOption);

  const refreshDetails = (): void => {
    details.textContent = describeSite(current);
  };

  const setSite = (site: LandingSite, notify = true): void => {
    if (!siteMap.has(site.id)) addOption(site);
    current = siteMap.get(site.id) ?? site;
    select.value = current.id;
    refreshDetails();
    if (notify) options.onSelect(current);
  };

  select.addEventListener('change', () => {
    const site = siteMap.get(select.value);
    if (site) setSite(site);
  });

  const applyCustom = (): void => {
    const result = parseCustomSite(latInput.value, lonInput.value, nameInput.value);
    if (!result.site) {
      customError.textContent = result.error ?? '';
      return;
    }
    customError.textContent = '';
    setSite(result.site);
  };

  useButton.addEventListener('click', applyCustom);
  [latInput, lonInput, nameInput].forEach((input) =>
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') applyCustom();
    }),
  );

  setSite(current, false);

  return {
    element: panel,
    getSite: () => current,
    setSite,
    dispose: () => panel.remove(),
  };
}