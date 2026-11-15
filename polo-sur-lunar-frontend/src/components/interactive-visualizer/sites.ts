export type SiteCategory = 'commercial' | 'polar' | 'custom';

export interface LandingSite {
  id: string;
  name: string;
  lat: number;
  lon: number;
  category: SiteCategory;
  agency: string;
  year?: number;
  note?: string;
}

export const CATEGORY_LABELS: Record<SiteCategory, string> = {
  commercial: 'Misiones comerciales / CLPS (EE. UU.)',
  polar: 'Referencias del polo sur',
  custom: 'Personalizados',
};

export const CATEGORY_ORDER: SiteCategory[] = ['polar', 'commercial', 'custom'];

export const SITES: LandingSite[] = [
  { id: 'shackleton', name: 'Shackleton (borde)', lat: -89.76, lon: 203.58, category: 'polar', agency: 'Referencia', note: 'cresta del cráter, elegida con datos LOLA' },
  { id: 'south-pole', name: 'Polo sur geográfico', lat: -90, lon: 0, category: 'polar', agency: 'Referencia' },
  { id: 'im2', name: 'IM-2 Athena (Mons Mouton)', lat: -84.79, lon: 29.2, category: 'commercial', agency: 'Intuitive Machines / NASA CLPS', year: 2025 },
  { id: 'im1', name: 'IM-1 Odysseus (Malapert A)', lat: -80.13, lon: 1.44, category: 'commercial', agency: 'Intuitive Machines / NASA CLPS', year: 2024 },
];

export function formatCoordinates(lat: number, lon: number): string {
  const ns = lat < 0 ? 'S' : 'N';
  const ew = lon < 0 ? 'O' : 'E';
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
}

export function describeSite(site: LandingSite): string {
  const parts = [formatCoordinates(site.lat, site.lon), site.agency];
  if (site.year) parts.push(String(site.year));
  const base = parts.join(' · ');
  return site.note ? `${base} (${site.note})` : base;
}

export interface CustomSiteResult {
  site: LandingSite | null;
  error: string | null;
}

export function parseCustomSite(latText: string, lonText: string, nameText: string): CustomSiteResult {
  const latRaw = latText.trim().replace(',', '.');
  const lonRaw = lonText.trim().replace(',', '.');
  if (latRaw === '' || lonRaw === '') {
    return { site: null, error: 'Ingresa latitud y longitud.' };
  }

  const lat = Number(latRaw);
  const lonInput = Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lonInput)) {
    return { site: null, error: 'Latitud y longitud deben ser números.' };
  }
  if (lat < -90 || lat > 90) {
    return { site: null, error: 'La latitud debe estar entre −90° y 90°.' };
  }
  if (lonInput < -180 || lonInput > 360) {
    return { site: null, error: 'La longitud debe estar entre −180° y 360°.' };
  }

  const lon = lonInput > 180 ? lonInput - 360 : lonInput;
  const name = nameText.trim() || `Personalizado (${formatCoordinates(lat, lon)})`;
  return {
    site: {
      id: `custom-${lat.toFixed(4)}_${lon.toFixed(4)}`,
      name,
      lat,
      lon,
      category: 'custom',
      agency: 'Coordenadas ingresadas por el usuario',
    },
    error: null,
  };
}