import React from 'react'
import {Panel} from './Sitios.jsx'

const L = (l, es, en) => (l === 'es' ? es : en)
const Dg = ({children}) => <svg viewBox="0 0 300 130" className="diagram"><rect width="300" height="130" fill="#05070f"/>{children}<defs><pattern id="ht" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line y2="6" stroke="#666" strokeWidth="1.2"/></pattern></defs></svg>
const LowSun = ({l}) => <Dg><rect y="100" width="300" height="30" fill="url(#ht)"/><line y1="100" x2="300" y2="100" stroke="#ccc"/><path d="M60 100 L90 82 L120 100Z" fill="#4a4b52"/><path d="M120 100 L160 78 L200 100Z" fill="#3a3b42"/>
  <circle cx="255" cy="93" r="9" fill="#ffc857"/><line x1="245" y1="94" x2="125" y2="95" stroke="#ffc857" strokeDasharray="4 3"/><text x="150" y="88" className="d-label">1.5°</text><text x="10" y="18" className="d-label">{L(l, 'El Sol casi no sube', 'The Sun barely rises')}</text></Dg>
const Crater = ({l}) => <Dg><path d="M30 60 L90 60 L110 108 L190 108 L210 60 L270 60 L270 130 L30 130Z" fill="#2a2b31"/><path d="M110 108 L190 108 L190 130 L110 130Z" fill="#000"/>
  <line x1="290" y1="16" x2="205" y2="58" stroke="#ffc857" strokeDasharray="4 3"/><circle cx="288" cy="14" r="8" fill="#ffc857"/><text x="118" y="100" className="d-label bad">{L(l, 'sombra eterna', 'eternal shadow')}</text><text x="40" y="52" className="d-label ok">{L(l, 'borde con luz', 'sunlit rim')}</text></Dg>
const EarthView = ({l}) => <Dg><line y1="75" x2="300" y2="75" stroke="#ccc"/><rect y="75" width="300" height="55" fill="url(#ht)"/><circle cx="90" cy="40" r="11" fill="#3d63d8" stroke="#89e5fc"/><text x="108" y="44" className="d-label ok">{L(l, 'se ve: hay enlace', 'visible: link')}</text>
  <circle cx="200" cy="100" r="11" fill="#3d63d8" opacity=".4"/><text x="150" y="124" className="d-label bad">{L(l, 'bajo el horizonte: sin enlace', 'below horizon: no link')}</text></Dg>

const CARDS = [[LowSun, ['El Sol rasante', 'The skimming Sun'], ['En el polo el Sol nunca sube más de ~1.5° sobre el horizonte, así que el relieve decide dónde hay luz y dónde sombra.', 'At the pole the Sun never climbs above ~1.5°, so terrain decides where it is light or dark.']],
  [Crater, ['Cráteres y hielo', 'Craters and ice'], ['Los bordes casi siempre iluminados dan energía; el fondo de algunos cráteres no recibe luz jamás y guarda hielo de agua.', 'Rims are almost always sunlit and give power; some crater floors never see light and hold water ice.']],
  [EarthView, ['Hablar con la Tierra', 'Talking to Earth'], ['Para comunicarte debes ver la Tierra sobre el horizonte. Oscila en el cielo lunar, así que a veces se ve y a veces no.', 'To communicate you must see Earth above the horizon. It wobbles in the lunar sky, so it comes and goes.']]]
const STEPS = [['Elige un lugar en SITIOS o en el mapa de INICIO.', 'Pick a place in SITES or on the HOME map.'], ['Mira en CIELO dónde están el Sol y la Tierra ahora.', 'Check in SKY where the Sun and Earth are now.'],
  ['Revisa en TERRENO si una montaña tapa la luz.', 'Check in TERRAIN if a mountain blocks the light.'], ['Busca en CALENDARIO las mejores fechas para tu misión.', 'Find the best dates for your mission in CALENDAR.'], ['Cambia a modo EXPERTO para ver cifras y exportar datos.', 'Switch to EXPERT mode to see figures and export data.']]
const FAQ = [['¿Qué significa "puntuación"?', 'What does "score" mean?', 'Un número de 0 a 100 que combina luz solar, contacto con la Tierra y duración de las noches. Más alto es mejor.', 'A 0–100 number combining sunlight, Earth contact and night length. Higher is better.'],
  ['¿Por qué importa el relieve?', 'Why does terrain matter?', 'Con el Sol a solo 1.5° del horizonte, una cresta de pocos metros puede dejar un sitio en sombra.', 'With the Sun just 1.5° up, a ridge a few metres tall can leave a site in shadow.'],
  ['¿Son datos reales?', 'Is this real data?', 'Por ahora son datos de ejemplo; se sustituirán por efemérides de la NASA (SPICE) y altimetría LOLA.', 'For now it is sample data; it will be replaced by NASA ephemerides (SPICE) and LOLA altimetry.'],
  ['¿Qué es el modo Fácil?', 'What is Easy mode?', 'Explica cada gráfico con palabras sencillas. El modo Experto muestra los números y permite exportarlos.', 'Explains every chart in plain words. Expert mode shows the numbers and lets you export them.'],
  ['¿Puedo comparar fechas?', 'Can I compare dates?', 'Sí: el calendario muestra 30 días de luz y comunicación para todos los lugares a la vez.', 'Yes: the calendar shows 30 days of light and communication for every place at once.']]
const GLOSS = [['Elevación', 'Elevation', 'Altura de algo sobre el horizonte, en grados.', 'Height above the horizon, in degrees.'], ['Azimut', 'Azimuth', 'Dirección de la brújula: 0° norte, 90° este.', 'Compass direction: 0° north, 90° east.'],
  ['Horizonte', 'Horizon', 'Línea donde el cielo se encuentra con el relieve.', 'Line where sky meets terrain.'], ['Máscara', 'Mask', 'Elevación mínima que exiges para dar un astro por visible.', 'Minimum elevation you require to count a body as visible.'],
  ['Libración', 'Libration', 'Pequeño balanceo de la Luna que mueve la Tierra en el cielo.', 'Small wobble of the Moon that moves Earth in the sky.'], ['Enlace directo (DTE)', 'Direct-to-Earth (DTE)', 'Comunicación por radio sin relevos, con la Tierra a la vista.', 'Radio link with no relay, with Earth in view.'],
  ['Noche', 'Night', 'Periodo continuo sin Sol sobre el horizonte.', 'Continuous period with no Sun above the horizon.'], ['Terminador', 'Terminator', 'Línea que separa el día de la noche en la Luna.', 'Line separating day from night on the Moon.'],
  ['Pico de luz eterna', 'Peak of eternal light', 'Lugar elevado que casi siempre recibe Sol.', 'High spot that almost always gets Sunlight.'], ['Región en sombra (PSR)', 'Shadowed region (PSR)', 'Zona que nunca recibe luz directa; puede contener hielo.', 'Area that never gets direct light; may hold ice.'],
  ['Puntuación', 'Score', 'Número de 0 a 100 que resume qué tan bueno es un sitio.', '0–100 number summarising how good a site is.']]

export default function Aprender({l, mode}) {
  const i = l === 'es' ? 0 : 1, easy = mode !== 'exp'
  return <div className="detail-body ty-home">
    <Panel title={L(l, 'EL POLO SUR LUNAR', 'THE LUNAR SOUTH POLE')} easy={easy} help={L(l, 'Tres ideas clave para entender todo lo demás.', 'Three key ideas to understand everything else.')}>
      <div className="learn-cards">{CARDS.map(([Art, t, p]) => <article key={t[0]} className="learn-card"><Art l={l}/><h3>{t[i]}</h3><p>{p[i]}</p></article>)}</div>
    </Panel>
    <div className="learn-cols">
      <Panel title={L(l, 'CÓMO USAR LA APP', 'HOW TO USE THE APP')}><ol className="steps">{STEPS.map(s => <li key={s[0]}>{s[i]}</li>)}</ol></Panel>
      <Panel title={L(l, 'PREGUNTAS FRECUENTES', 'FAQ')}><div className="faq">{FAQ.map(f => <details key={f[0]}><summary>{f[i]}</summary><p>{f[i + 2]}</p></details>)}</div></Panel>
    </div>
    <Panel title={L(l, 'GLOSARIO', 'GLOSSARY')}><dl className="glossary">{GLOSS.map(g => <div key={g[0]}><dt>{g[i]}</dt><dd>{g[i + 2]}</dd></div>)}</dl></Panel>
    <Panel title={L(l, 'ACERCA DE', 'ABOUT')}><p className="about">{L(l, 'Herramienta para comparar lugares y fechas de aterrizaje en el polo sur lunar, visualizando el Sol y la Tierra respecto al horizonte para evaluar energía solar y comunicación directa.', 'A tool to compare landing sites and dates at the lunar south pole, showing the Sun and Earth against the horizon to assess solar power and direct communication.')}</p></Panel>
  </div>
}
