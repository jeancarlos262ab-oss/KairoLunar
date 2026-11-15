import {
  CATEGORY_ORDER,
  categoryLabel,
  describeSite,
  parseCustomSite,
  siteLabel,
  type LandingSite,
  type SiteCategory,
} from './sites';
import { onLangChange, tr } from './i18n';
import { element, makeButton } from './ui';

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

  const panel = element('div', 'kv-panel kv-selector');
  panel.setAttribute('role', 'group');

  const label = element('label', 'kv-stack');
  const labelText = element('span', 'kv-title');
  const select = element('select', 'kv-field kv-wide');
  label.append(labelText, select);

  const details = element('div', 'kv-muted');

  const customBox = element('details', 'kv-sep');
  const summary = element('summary', 'kv-summary');
  const customBody = element('div', 'kv-stack kv-custom-body');

  const latInput = element('input', 'kv-field kv-wide');
  latInput.type = 'text';
  latInput.inputMode = 'decimal';

  const lonInput = element('input', 'kv-field kv-wide');
  lonInput.type = 'text';
  lonInput.inputMode = 'decimal';

  const nameInput = element('input', 'kv-field kv-wide');
  nameInput.type = 'text';

  const useButton = makeButton('', '', 'kv-btn kv-wide');
  const customError = element('div', 'kv-error');
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
      group.label = categoryLabel(site.category);
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
    option.textContent = siteLabel(site);
    option.dataset.siteId = site.id;
    group.appendChild(option);
  };

  options.sites.forEach(addOption);

  const applyLang = (): void => {
    panel.setAttribute('aria-label', tr('Selección de sitio de aterrizaje'));
    labelText.textContent = tr('Sitio de aterrizaje');
    select.setAttribute('aria-label', tr('Sitio de aterrizaje'));
    summary.textContent = tr('Coordenadas personalizadas');
    latInput.placeholder = tr('Latitud (−90 a 90), p. ej. −85.5');
    latInput.setAttribute('aria-label', tr('Latitud en grados'));
    lonInput.placeholder = tr('Longitud (−180 a 360), p. ej. 31.2');
    lonInput.setAttribute('aria-label', tr('Longitud este en grados'));
    nameInput.placeholder = tr('Nombre (opcional)');
    nameInput.setAttribute('aria-label', tr('Nombre del sitio personalizado'));
    useButton.textContent = tr('Usar estas coordenadas');
    useButton.setAttribute('aria-label', tr('Usar las coordenadas ingresadas'));
    groups.forEach((group, category) => {
      group.label = categoryLabel(category);
    });
    select.querySelectorAll<HTMLOptionElement>('option').forEach((option) => {
      const site = siteMap.get(option.dataset.siteId ?? '');
      if (site) option.textContent = siteLabel(site);
    });
    customError.textContent = '';
    details.textContent = describeSite(current);
  };

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
  applyLang();
  const offLang = onLangChange(applyLang);

  return {
    element: panel,
    getSite: () => current,
    setSite,
    dispose: () => {
      offLang();
      panel.remove();
    },
  };
}