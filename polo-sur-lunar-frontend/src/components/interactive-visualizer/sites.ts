export type SiteCategory = 'commercial' | 'polar' | 'artemis' | 'custom';

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
  artemis: 'Artemis III (regiones candidatas)',
  custom: 'Personalizados',
};

export const CATEGORY_ORDER: SiteCategory[] = ['polar', 'commercial', 'artemis', 'custom'];

export const SITES: LandingSite[] = [
  { id: 'shackleton', name: 'Shackleton (borde)', lat: -89.76, lon: -156.42, category: 'polar', agency: 'Referencia', note: 'cresta del cráter, elegida con datos LOLA' },
  { id: 'south-pole', name: 'Polo sur geográfico', lat: -90, lon: 0, category: 'polar', agency: 'Referencia' },
  { id: 'im2', name: 'IM-2 Athena (Mons Mouton)', lat: -84.79, lon: 29.2, category: 'commercial', agency: 'Intuitive Machines / NASA CLPS', year: 2025 },
  { id: 'im1', name: 'IM-1 Odysseus (Malapert A)', lat: -80.13, lon: 1.44, category: 'commercial', agency: 'Intuitive Machines / NASA CLPS', year: 2024 },
  { id: 'nobile-rim-2', name: 'Nobile Rim 2', lat: -83.9541, lon: 58.8215, category: 'artemis', agency: 'NASA · Artemis III', note: 'centro de la región, ≈400 km²' },
  { id: 'mons-mouton', name: 'Mons Mouton', lat: -85.4266, lon: 31.7428, category: 'artemis', agency: 'NASA · Artemis III', note: 'centro de la región, ≈256 km²' },
  { id: 'malapert-massif', name: 'Malapert Massif', lat: -85.9948, lon: -0.2358, category: 'artemis', agency: 'NASA · Artemis III', note: 'centro de la región, ≈441 km²' },
  { id: 'de-gerlache-rim-2', name: 'de Gerlache Rim 2', lat: -88.23, lon: -64.6284, category: 'artemis', agency: 'NASA · Artemis III', note: 'centro de la región, ≈400 km²' },
  { id: 'mons-mouton-plateau', name: 'Mons Mouton Plateau', lat: -84.3347, lon: 30.5923, category: 'artemis', agency: 'NASA · Artemis III', note: 'centro de una región amplia, ≈4 450 km²' },
  { id: 'slater-plain', name: 'Slater Plain', lat: -87.1637, lon: 125.5377, category: 'artemis', agency: 'NASA · Artemis III', note: 'centro de la región, ≈400 km²' },
  { id: 'peak-near-cabeus-b', name: 'Peak near Cabeus B', lat: -83.6375, lon: -68.7495, category: 'artemis', agency: 'NASA · Artemis III', note: 'centro de la región, ≈400 km²' },
  { id: 'nobile-rim-1', name: 'Nobile Rim 1', lat: -85.4364, lon: 37.347, category: 'artemis', agency: 'NASA · Artemis III', note: 'centro de la región, ≈400 km²' },
  { id: 'haworth', name: 'Haworth', lat: -86.7639, lon: -22.777, category: 'artemis', agency: 'NASA · Artemis III', note: 'centro de la región, ≈888 km²' },
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