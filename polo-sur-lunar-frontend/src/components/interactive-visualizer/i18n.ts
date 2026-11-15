export type Lang = 'es' | 'en';
export type Mode = 'basic' | 'expert';

type Listener = (lang: Lang) => void;

const STORAGE_KEY = 'lunar-visualizer:lang';
const MODE_KEY = 'lunar-visualizer:mode';

const EN: Record<string, string> = {
  'Sitio de aterrizaje': 'Landing site',
  'Selección de sitio de aterrizaje': 'Landing site selection',
  'Coordenadas personalizadas': 'Custom coordinates',
  'Latitud (−90 a 90), p. ej. −85.5': 'Latitude (−90 to 90), e.g. −85.5',
  'Latitud en grados': 'Latitude in degrees',
  'Longitud (−180 a 360), p. ej. 31.2': 'Longitude (−180 to 360), e.g. 31.2',
  'Longitud este en grados': 'East longitude in degrees',
  'Nombre (opcional)': 'Name (optional)',
  'Nombre del sitio personalizado': 'Custom site name',
  'Usar estas coordenadas': 'Use these coordinates',
  'Usar las coordenadas ingresadas': 'Use the entered coordinates',

  'Misiones comerciales / CLPS (EE. UU.)': 'Commercial missions / CLPS (US)',
  'Referencias del polo sur': 'South pole references',
  'Artemis III (regiones candidatas)': 'Artemis III (candidate regions)',
  'Personalizados': 'Custom',
  'Personalizado': 'Custom',

  'Shackleton (borde)': 'Shackleton (rim)',
  'Polo sur geográfico': 'Geographic south pole',
  'Referencia': 'Reference',
  'Coordenadas ingresadas por el usuario': 'User-entered coordinates',
  'cresta del cráter, elegida con datos LOLA': 'crater rim, chosen using LOLA data',
  'centro de la región': 'center of the region',
  'centro de una región amplia': 'center of a large region',
  'O': 'W',

  'Ingresa latitud y longitud.': 'Enter latitude and longitude.',
  'Latitud y longitud deben ser números.': 'Latitude and longitude must be numbers.',
  'La latitud debe estar entre −90° y 90°.': 'Latitude must be between −90° and 90°.',
  'La longitud debe estar entre −180° y 360°.': 'Longitude must be between −180° and 360°.',

  'Control de fecha y hora (UTC)': 'Date and time control (UTC)',
  'Fecha y hora en UTC': 'Date and time in UTC',
  'Fecha y hora (UTC)': 'Date and time (UTC)',
  'Ahora': 'Now',
  'Ir a la fecha y hora actuales': 'Go to the current date and time',
  'Desplazamiento en horas respecto a la fecha base': 'Offset in hours from the base date',
  '−1 día': '−1 day',
  'Retroceder un día': 'Go back one day',
  '+1 día': '+1 day',
  'Avanzar un día': 'Go forward one day',
  '▶ Reproducir': '▶ Play',
  '⏸ Pausar': '⏸ Pause',
  'Reproducir o pausar la animación': 'Play or pause the animation',
  '☀↑ Amanecer': '☀↑ Sunrise',
  'Ir al siguiente amanecer': 'Go to the next sunrise',
  '☀↓ Atardecer': '☀↓ Sunset',
  'Ir al siguiente atardecer': 'Go to the next sunset',
  'Velocidad de la animación': 'Animation speed',
  '1 día/s': '1 day/s',
  '3 días/s': '3 days/s',
  '7 días/s': '7 days/s',
  'No hay amanecer en los próximos 32 días en este sitio.': 'There is no sunrise in the next 32 days at this site.',
  'No hay atardecer en los próximos 32 días en este sitio.': 'There is no sunset in the next 32 days at this site.',

  'Abrir el instructivo': 'Open the guide',
  'Cómo usar el visualizador': 'How to use the visualizer',
  'Cerrar el instructivo': 'Close the guide',
  'No volver a mostrar al iniciar': 'Do not show again on start',
  'Atrás': 'Back',
  'Paso anterior': 'Previous step',
  'Siguiente': 'Next',
  'Paso siguiente': 'Next step',
  'Empezar': 'Start',
  'Cerrar el instructivo y empezar': 'Close the guide and start',
  'Paso': 'Step',
  'de': 'of',

  'Elige una misión': 'Choose a mission',
  'Arriba a la izquierda abre «Sitio de aterrizaje» y escoge una misión, como IM-2 o Shackleton. La escena viaja a ese lugar y el módulo vuelve a aterrizar.':
    'At the top left, open “Landing site” and pick a mission, such as IM-2 or Shackleton. The scene travels to that place and the lander touches down again.',
  'También puedes abrir «Coordenadas personalizadas» y escribir cualquier latitud y longitud.':
    'You can also open “Custom coordinates” and type any latitude and longitude.',
  'Los sitios de la lista usan datos reales de la NASA (LOLA). Si pones coordenadas fuera de la zona al sur de 80°S, el terreno será de ejemplo.':
    'The listed sites use real NASA data (LOLA). If you enter coordinates outside the area south of 80°S, the terrain will be a sample one.',
  'Horas de sol y amanecer': 'Sun hours and sunrise',
  'En la barra de abajo elige la fecha y la hora (UTC), o pulsa «Reproducir» para ver pasar los días.':
    'In the bottom bar, choose the date and time (UTC), or press “Play” to watch the days go by.',
  'Los botones «Amanecer» y «Atardecer» saltan al próximo evento del Sol en ese sitio.':
    'The “Sunrise” and “Sunset” buttons jump to the next Sun event at that site.',
  'El panel «Sol» indica si hay luz para generar energía y cuánto falta para el siguiente amanecer o puesta. El panel «Tierra» indica si hay línea de vista para comunicarse.':
    'The “Sun” panel shows whether there is light to generate power and how long until the next sunrise or sunset. The “Earth” panel shows whether there is a line of sight for communications.',
  'Qué muestran las coordenadas polares': 'What the polar coordinates show',
  'El círculo del panel «Cielo» es el cielo visto desde arriba: el centro queda justo sobre tu cabeza y el borde es el horizonte.':
    'The circle in the “Sky” panel is the sky seen from above: the center is right overhead and the edge is the horizon.',
  'La dirección alrededor del círculo es el azimut (norte arriba, este a la derecha) y la distancia al centro indica qué tan alto está el astro: la elevación.':
    'The direction around the circle is the azimuth (north up, east right), and the distance from the center shows how high the body is: its elevation.',
  'El punto amarillo es el Sol y el azul es la Tierra. La zona gris es el relieve que tapa el cielo: si un astro cae ahí, no se ve desde el sitio.':
    'The yellow dot is the Sun and the blue one is the Earth. The gray area is terrain blocking the sky: if a body falls there, it cannot be seen from the site.',

  'Posición del Sol y de la Tierra sobre el horizonte': 'Position of the Sun and the Earth above the horizon',
  'Diagrama del cielo visto desde arriba: el centro es el cenit, el borde es el horizonte, el norte arriba y el este a la derecha. La zona gris es el relieve que tapa el cielo.':
    'Sky diagram seen from above: the center is the zenith, the edge is the horizon, north is up and east is to the right. The gray area is terrain blocking the sky.',
  'Sol': 'Sun',
  'Tierra': 'Earth',
  'Cielo en': 'Sky at',
  'Elevación': 'Elevation',
  'Azimut': 'Azimuth',
  'Horizonte': 'Horizon',
  'Puesta de Sol en': 'Sunset in',
  'Amanecer en': 'Sunrise in',
  'Puesta de la Tierra en': 'Earth sets in',
  'Salida de la Tierra en': 'Earth rises in',
  'sobre el horizonte': 'above the horizon',
  'bajo el horizonte': 'below the horizon',
  'Generación solar posible': 'Solar generation possible',
  'Sin generación solar': 'No solar generation',
  'Línea de vista directa a la Tierra': 'Direct line of sight to Earth',
  'Sin línea de vista a la Tierra': 'No line of sight to Earth',
  'Horizonte esférico (sin datos LOLA para este sitio)': 'Spherical horizon (no LOLA data for this site)',
  'Artemis III (centro de la región)': 'Artemis III (region center)',
  'radio': 'radius',
  'cobertura parcial': 'partial coverage',

  'Básico': 'Basic',
  'Experto': 'Expert',
  'Modo de visualización': 'Display mode',
  'Modo básico: términos sencillos': 'Basic mode: plain terms',
  'Modo experto: datos técnicos': 'Expert mode: technical data',

  'Sol sobre el horizonte': 'Sun above the horizon',
  'Sol bajo el horizonte': 'Sun below the horizon',
  'Elevación solar': 'Solar elevation',
  'Edad lunar': 'Lunar age',
};

const BASIC: Record<string, Record<Lang, string>> = {
  'Sitio de aterrizaje': { es: 'Lugar de aterrizaje', en: 'Landing place' },
  'Puesta de Sol en': { es: 'Se hace de noche en', en: 'Night falls in' },
  'Amanecer en': { es: 'Sale el Sol en', en: 'Sunrise in' },
  'Puesta de la Tierra en': { es: 'La Tierra se oculta en', en: 'Earth hides in' },
  'Salida de la Tierra en': { es: 'La Tierra aparece en', en: 'Earth appears in' },
  'Generación solar posible': { es: 'Hay luz del Sol', en: 'Sunlight available' },
  'Sin generación solar': { es: 'Es de noche: no hay luz del Sol', en: 'Night: no sunlight' },
  'Línea de vista directa a la Tierra': { es: 'La Tierra se ve en el cielo', en: 'Earth is visible in the sky' },
  'Sin línea de vista a la Tierra': { es: 'La Tierra no se ve ahora', en: 'Earth is not visible now' },
  'sobre el horizonte': { es: 'a la vista', en: 'in view' },
  'bajo el horizonte': { es: 'oculto', en: 'hidden' },
  'Sol sobre el horizonte': { es: 'Es de día: el Sol está a la vista', en: 'Daytime: the Sun is up' },
  'Sol bajo el horizonte': { es: 'Es de noche: el Sol está oculto', en: 'Night: the Sun is hidden' },
  'Arriba a la izquierda abre «Sitio de aterrizaje» y escoge una misión, como IM-2 o Shackleton. La escena viaja a ese lugar y el módulo vuelve a aterrizar.': {
    es: 'Arriba a la izquierda abre «Lugar de aterrizaje» y escoge uno, como Shackleton o IM-2. La escena viaja a ese lugar y la nave vuelve a aterrizar.',
    en: 'At the top left, open “Landing place” and pick one, such as Shackleton or IM-2. The scene travels there and the lander touches down again.',
  },
  'También puedes abrir «Coordenadas personalizadas» y escribir cualquier latitud y longitud.': {
    es: 'Puedes cambiar de lugar las veces que quieras: el paisaje y el Sol se actualizan solos.',
    en: 'You can switch places as often as you like: the landscape and the Sun update by themselves.',
  },
  'Los sitios de la lista usan datos reales de la NASA (LOLA). Si pones coordenadas fuera de la zona al sur de 80°S, el terreno será de ejemplo.': {
    es: 'Todos los lugares de la lista son zonas reales cerca del polo sur de la Luna, con datos de la NASA.',
    en: 'Every place on the list is a real area near the Moon’s south pole, built from NASA data.',
  },
  'En la barra de abajo elige la fecha y la hora (UTC), o pulsa «Reproducir» para ver pasar los días.': {
    es: 'En la barra de abajo elige el día y la hora, o pulsa «Reproducir» para ver pasar el tiempo.',
    en: 'In the bottom bar, pick the day and time, or press “Play” to watch time go by.',
  },
  'Los botones «Amanecer» y «Atardecer» saltan al próximo evento del Sol en ese sitio.': {
    es: 'Los botones «Amanecer» y «Atardecer» saltan al próximo momento en que sale o se oculta el Sol.',
    en: 'The “Sunrise” and “Sunset” buttons jump to the next moment the Sun rises or hides.',
  },
  'El panel «Sol» indica si hay luz para generar energía y cuánto falta para el siguiente amanecer o puesta. El panel «Tierra» indica si hay línea de vista para comunicarse.': {
    es: 'En «Sol» verás si hay luz y cuánto falta para el siguiente amanecer o la noche. «Tierra» indica si nuestro planeta se ve en el cielo, algo clave para comunicarse.',
    en: 'Under “Sun” you will see whether there is light and how long until the next sunrise or nightfall. “Earth” shows whether our planet is visible in the sky, which is key for communications.',
  },
  'Qué muestran las coordenadas polares': { es: 'Cómo leer el panel del cielo', en: 'How to read the sky panel' },
  'El círculo del panel «Cielo» es el cielo visto desde arriba: el centro queda justo sobre tu cabeza y el borde es el horizonte.': {
    es: 'El círculo es el cielo visto desde arriba: el centro queda justo sobre ti y el borde es el horizonte.',
    en: 'The circle is the sky seen from above: the center is right above you and the edge is the horizon.',
  },
  'La dirección alrededor del círculo es el azimut (norte arriba, este a la derecha) y la distancia al centro indica qué tan alto está el astro: la elevación.': {
    es: 'Las letras N, S, E y O son los puntos cardinales. Cuanto más cerca del centro está un punto, más alto se ve en el cielo.',
    en: 'The letters N, S, E and W are the compass points. The closer a dot is to the center, the higher it is in the sky.',
  },
  'El punto amarillo es el Sol y el azul es la Tierra. La zona gris es el relieve que tapa el cielo: si un astro cae ahí, no se ve desde el sitio.': {
    es: 'El punto amarillo es el Sol y el azul es la Tierra. La zona gris son montañas que tapan el cielo: si un punto cae ahí, no se ve.',
    en: 'The yellow dot is the Sun and the blue one is the Earth. The gray area is mountains blocking the sky: if a dot falls there, it cannot be seen.',
  },
};

function readStored(): Lang | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'en' || value === 'es' ? value : null;
  } catch {
    return null;
  }
}

function readStoredMode(): Mode | null {
  try {
    const value = window.localStorage.getItem(MODE_KEY);
    return value === 'basic' || value === 'expert' ? value : null;
  } catch {
    return null;
  }
}

function writeStoredMode(mode: Mode): void {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    return;
  }
}

function writeStored(lang: Lang): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    return;
  }
}

let current: Lang = readStored() ?? 'es';
let currentMode: Mode = readStoredMode() ?? 'basic';
const listeners = new Set<Listener>();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  writeStored(lang);
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  listeners.forEach((listener) => listener(lang));
}

export function getMode(): Mode {
  return currentMode;
}

export function setMode(mode: Mode): void {
  if (mode === currentMode) return;
  currentMode = mode;
  writeStoredMode(mode);
  listeners.forEach((listener) => listener(current));
}

export function onLangChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function tr(text: string): string {
  if (currentMode === 'basic') {
    const override = BASIC[text];
    if (override) return override[current];
  }
  if (current === 'es') return text;
  return EN[text] ?? text;
}