export type SiteCategory = 'apollo' | 'china' | 'india' | 'japan' | 'commercial' | 'polar' | 'custom';

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
  apollo: 'Programa Apolo (EE. UU.)',
  commercial: 'Misiones comerciales / CLPS (EE. UU.)',
  china: 'China (CNSA)',
  india: 'India (ISRO)',
  japan: 'Japón (JAXA)',
  polar: 'Referencias del polo sur',
  custom: 'Personalizados',
};

export const CATEGORY_ORDER: SiteCategory[] = [
  'polar',
  'commercial',
  'apollo',
  'china',
  'india',
  'japan',
  'custom',
];

export const SITES: LandingSite[] = [
  { id: 'shackleton', name: 'Shackleton (borde)', lat: -89.9, lon: 129.78, category: 'polar', agency: 'Referencia', note: 'coordenadas aproximadas' },
  { id: 'south-pole', name: 'Polo sur geográfico', lat: -90, lon: 0, category: 'polar', agency: 'Referencia' },
  { id: 'im2', name: 'IM-2 Athena (Mons Mouton)', lat: -84.79, lon: 29.2, category: 'commercial', agency: 'Intuitive Machines / NASA CLPS', year: 2025 },
  { id: 'im1', name: 'IM-1 Odysseus (Malapert A)', lat: -80.13, lon: 1.44, category: 'commercial', agency: 'Intuitive Machines / NASA CLPS', year: 2024 },
  { id: 'blue-ghost-1', name: 'Blue Ghost 1 (Mare Crisium)', lat: 18.562, lon: 61.81, category: 'commercial', agency: 'Firefly / NASA CLPS', year: 2025 },
  { id: 'apollo-11', name: 'Apolo 11', lat: 0.6741, lon: 23.473, category: 'apollo', agency: 'NASA', year: 1969 },
  { id: 'apollo-12', name: 'Apolo 12', lat: -3.0128, lon: -23.4219, category: 'apollo', agency: 'NASA', year: 1969 },
  { id: 'apollo-14', name: 'Apolo 14', lat: -3.6453, lon: -17.4714, category: 'apollo', agency: 'NASA', year: 1971 },
  { id: 'apollo-15', name: 'Apolo 15', lat: 26.1322, lon: 3.6333, category: 'apollo', agency: 'NASA', year: 1971 },
  { id: 'apollo-16', name: 'Apolo 16', lat: -8.973, lon: 15.5002, category: 'apollo', agency: 'NASA', year: 1972 },
  { id: 'apollo-17', name: 'Apolo 17', lat: 20.1908, lon: 30.7717, category: 'apollo', agency: 'NASA', year: 1972 },
  { id: 'change-3', name: "Chang'e 3", lat: 44.1214, lon: -19.5117, category: 'china', agency: 'CNSA', year: 2013 },
  { id: 'change-4', name: "Chang'e 4 (cara oculta)", lat: -45.4561, lon: 177.5885, category: 'china', agency: 'CNSA', year: 2019 },
  { id: 'change-5', name: "Chang'e 5", lat: 43.0576, lon: -51.9161, category: 'china', agency: 'CNSA', year: 2020 },
  { id: 'change-6', name: "Chang'e 6 (cara oculta)", lat: -41.6385, lon: -153.9852, category: 'china', agency: 'CNSA', year: 2024 },
  { id: 'chandrayaan-3', name: 'Chandrayaan-3 (Shiv Shakti)', lat: -69.3741, lon: 32.32, category: 'india', agency: 'ISRO', year: 2023 },
  { id: 'slim', name: 'SLIM (Shioli)', lat: -13.316, lon: 25.251, category: 'japan', agency: 'JAXA', year: 2024 },
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