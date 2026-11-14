import React, {useMemo} from 'react'
import * as d3 from 'd3'
import {SITES} from './Screens.jsx'

const L = (l, es, en) => (l === 'es' ? es : en)
// Coordenadas de ejemplo (lat, lon) y color por sitio
const GEO = [[-89.9, 129], [-89.45, -139], [-88.5, -87], [-86, 2], [-85.2, 53], [-84.9, -35]]
const COL = ['#FFC857', '#7CF0C9', '#6889F7', '#FF8A65', '#C792EA', '#4FC3F7']
const fmt = v => Math.round(v) + '%'

// Métricas derivadas de los datos de ejemplo (sustituir por @lsp/engine)
const metrics = (s, i) => {
  const sun = s.light / 100, earth = s.comm / 100, both = Math.min(sun, earth) * .6
  const score = Math.round(Math.max(0, Math.min(100, 52 * sun + 38 * earth + 10 * (1 - s.dark / 14) )))
  return {...s, i, sun, earth, both, darkH: s.dark * 24, score, lat: GEO[i][0], lon: GEO[i][1], color: COL[i],
    maxSun: 1.5 - s.seed * .05, maxEarth: 4 + s.comm / 12}
}
const stars = v => '★'.repeat(Math.round(v * 5)) + '☆'.repeat(5 - Math.round(v * 5))

export const Panel = ({title, help, right, easy, children}) => (
  <section className="pn">
    <header><h2>{title}</h2>{right && <span>{right}</span>}</header>
    {easy && help && <p className="help"><i>i</i>{help}</p>}
    {children}
  </section>)

function PoleMap({rows, sel, onSelect, l, easy}) {
  const C = 160, R = 122, pos = r => { const a = r.lon * Math.PI / 180, d = (r.lat + 90) / 10 * R; return [C + d * Math.sin(a), C - d * Math.cos(a)] }
  return <Panel title={L(l, 'MAPA DEL POLO', 'POLE MAP')} easy={easy} right="90°S → 80°S"
    help={L(l, 'Vista desde arriba del polo sur. Cada punto es un lugar; toca uno para ver sus datos.', 'Top view of the south pole. Each dot is a place; tap one to see its data.')}>
    <svg viewBox="0 0 320 320" className="map" role="group">
      <defs><radialGradient id="pm" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#8d8a86"/><stop offset="1" stopColor="#3b3a3a"/></radialGradient></defs>
      <circle cx={C} cy={C} r={R} fill="url(#pm)"/>
      {[1, 2, 3, 4].map(k => <circle key={k} cx={C} cy={C} r={R * k / 5 * (5 / 5)} fill="none" stroke="#fff" strokeOpacity=".12"/>)}
      {d3.range(0, 360, 45).map(a => <line key={a} x1={C} y1={C} x2={C + R * Math.sin(a * Math.PI / 180)} y2={C - R * Math.cos(a * Math.PI / 180)} stroke="#fff" strokeOpacity=".1"/>)}
      <text x={C} y={14} textAnchor="middle" className="ax">0°</text><text x={310} y={C + 4} textAnchor="end" className="ax">90°E</text>
      <text x={C} y={316} textAnchor="middle" className="ax">180°</text><text x={10} y={C + 4} className="ax">90°O</text>
      {[[40, '#FFC857', 7], [-70, '#6889F7', 5]].map(([a, c, r2]) => <g key={a}><circle cx={C + (R + 12) * Math.sin(a * Math.PI / 180)} cy={C - (R + 12) * Math.cos(a * Math.PI / 180)} r={r2} fill={c} stroke="#fff" strokeOpacity=".6"/></g>)}
      {rows.map(r => { const [x, y] = pos(r), on = r.n === sel; return (
        <g key={r.n} tabIndex={0} role="button" aria-label={r.n} style={{cursor: 'pointer'}} onClick={() => onSelect(r.i)} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelect(r.i)}>
          {on && <circle cx={x} cy={y} r="13" fill="none" stroke="#fff" strokeWidth="1.5"/>}
          <circle cx={x} cy={y} r={on ? 6 : 4.5} fill={r.color} stroke={r.light > 60 ? '#FFC857' : '#000'} strokeWidth="1.5"/>
          {on && <text x={x + 12} y={y - 10} className="tag">{r.n}</text>}
        </g>) })}
    </svg>
    <div className="legend2"><span><i style={{background: '#FFC857'}}/>{L(l, 'Sol', 'Sun')}</span><span><i style={{background: '#6889F7'}}/>{L(l, 'Tierra', 'Earth')}</span><span><i style={{background: '#8d8a86'}}/>{L(l, 'Sitio', 'Site')}</span></div>
  </Panel>
}

function Metrics({a, l, easy}) {
  const items = [[L(l, 'Sol sobre el horizonte', 'Sun above horizon'), fmt(a.sun * 100), 'sun'], [L(l, 'Tierra visible', 'Earth visible'), fmt(a.earth * 100), 'earth'],
    [L(l, 'Sol y Tierra a la vez', 'Sun + Earth together'), fmt(a.both * 100)], [L(l, 'Noche más larga', 'Longest night'), a.darkH + ' h', 'sun'],
    [L(l, 'Elev. máx. Sol', 'Max Sun elev.'), a.maxSun.toFixed(2) + '°', 'sun'], [L(l, 'Elev. máx. Tierra', 'Max Earth elev.'), a.maxEarth.toFixed(2) + '°', 'earth'],
    [L(l, 'Latitud / Longitud', 'Lat / Lon'), `${Math.abs(a.lat)}°S · ${a.lon}°`], [L(l, 'Puntuación', 'Score'), a.score]]
  const head = <div className="sh2"><i style={{background: a.color}}/><div><b>{a.n}</b><small>{Math.abs(a.lat)}°S · {a.lon}°E</small></div></div>
  const verdict = a.sun > .75 ? L(l, 'Casi siempre tiene luz: ideal para energía solar.', 'Almost always sunlit: great for solar power.') : a.earth > .7 ? L(l, 'Se ve mucho la Tierra: ideal para comunicarse.', 'Earth is often visible: great for radio.') : L(l, 'Sitio equilibrado, con noches largas que planificar.', 'Balanced site, with long nights to plan for.')
  return <Panel title={L(l, 'MÉTRICAS DEL SITIO', 'SITE METRICS')} easy={easy} right="30 d"
    help={L(l, 'Resumen en palabras sencillas del sitio elegido.', 'A plain-words summary of the chosen site.')}>
    {head}
    {easy ? <>
      <p className="verdict">{verdict}</p>
      <ul className="vl">{[[L(l, 'Energía', 'Power'), a.sun], [L(l, 'Contacto con la Tierra', 'Earth contact'), a.earth], [L(l, 'Resistencia a la noche', 'Night resilience'), 1 - a.dark / 14]].map(([k, v]) =>
        <li key={k}><span>{k}</span><em aria-label={Math.round(v * 5) + '/5'}>{stars(v)}</em></li>)}</ul>
      <div className="both">{L(l, 'Tiene Sol y Tierra a la vez el', 'Sun and Earth together')} <b>{fmt(a.both * 100)}</b> {L(l, 'del tiempo.', 'of the time.')}</div>
    </> : <dl className="sg">{items.map(([k, v, t]) => <div key={k}><dt>{k}</dt><dd className={t}>{v}</dd></div>)}</dl>}
  </Panel>
}

function Ranking({rows, sel, onSelect, l, easy}) {
  const sorted = [...rows].sort((a, b) => b.score - a.score)
  const Bar = ({k, v, t, tone}) => <div className="mb"><span>{k}</span><div><i className={tone} style={{width: Math.max(2, v * 100) + '%'}}/></div><b>{t}</b></div>
  return <Panel title={L(l, 'CLASIFICACIÓN', 'RANKING')} easy={easy} right="30 d"
    help={L(l, 'Los lugares ordenados de mejor a peor según luz, contacto con la Tierra y noches cortas.', 'Places ranked best to worst by light, Earth contact and short nights.')}>
    <ol className="rl">{sorted.map((a, k) => (
      <li key={a.n}><button className={'rc' + (a.n === sel ? ' on' : '')} onClick={() => onSelect(a.i)}>
        <div className="rt"><span>{k + 1}</span><i style={{background: a.color}}/><b>{a.n}</b><strong>{a.score}</strong></div>
        <Bar k={easy ? L(l, 'Luz', 'Sunshine') : L(l, 'Energía', 'Power')} v={a.sun} t={fmt(a.sun * 100)} tone="sun"/>
        <Bar k={easy ? L(l, 'Contacto', 'Contact') : L(l, 'Comunic.', 'Comms')} v={a.earth} t={fmt(a.earth * 100)} tone="earth"/>
        <Bar k={easy ? L(l, 'Noche', 'Night') : L(l, 'Oscuridad', 'Dark')} v={a.dark / 14} t={a.darkH + ' h'} tone="dk"/>
      </button></li>))}</ol>
  </Panel>
}

function Compare({rows, sel, onSelect, l, easy}) {
  const W = 1000, RH = 58, PL = 150, PR = 40, sorted = useMemo(() => [...rows].sort((a, b) => b.score - a.score), [rows])
  const H = sorted.length * RH + 24
  const y = d3.scaleBand(sorted.map(a => a.n), [4, H - 20]).paddingInner(.25), x = d3.scaleLinear([0, 1], [0, W - PL - PR])
  const bars = [['sun', L(l, 'Sol', 'Sun'), '#FFC857'], ['earth', L(l, 'Tierra', 'Earth'), '#6889F7'], ['both', L(l, 'Ambos', 'Both'), '#7CF0C9']]
  return <Panel title={L(l, 'COMPARACIÓN', 'COMPARISON')} easy={easy} right={bars.map(b => b[1]).join(' · ')}
    help={L(l, 'Barras amarillas = luz, azules = Tierra, verdes = ambas a la vez. Más larga es mejor.', 'Yellow = light, blue = Earth, green = both at once. Longer is better.')}>
    <div className="cs"><svg viewBox={`0 0 ${W} ${H}`} className="cmpc">
      {[0, .25, .5, .75, 1].map(p => <g key={p}><line x1={PL + x(p)} x2={PL + x(p)} y1="0" y2={H - 18} stroke="#fff" strokeOpacity=".1"/><text x={PL + x(p)} y={H - 4} textAnchor="middle" className="ax">{p * 100}%</text></g>)}
      {sorted.map(a => { const t = y(a.n), bh = y.bandwidth() / 3; return (
        <g key={a.n} tabIndex={0} role="button" style={{cursor: 'pointer'}} onClick={() => onSelect(a.i)} onKeyDown={e => e.key === 'Enter' && onSelect(a.i)}>
          {a.n === sel && <rect x="0" y={t - 3} width={W} height={y.bandwidth() + 6} rx="8" fill="#fff" fillOpacity=".06"/>}
          <text x={PL - 10} y={t + y.bandwidth() / 2 + 4} textAnchor="end" className="ax" fontSize="12">{a.n}</text>
          {bars.map(([k, , c], j) => <g key={k}><rect x={PL} y={t + j * bh} width={x(a[k])} height={bh - 3} fill={c} rx="2"/><text x={PL + x(a[k]) + 6} y={t + j * bh + bh - 6} className="ax">{fmt(a[k] * 100)}</text></g>)}
        </g>) })}
    </svg></div>
  </Panel>
}

function Table({rows, sel, onSelect, l}) {
  const cols = [['n', L(l, 'Sitio', 'Site')], ['lat', 'Lat'], ['lon', 'Lon'], ['sun', L(l, 'Sol %', 'Sun %')], ['earth', L(l, 'Tierra %', 'Earth %')], ['both', L(l, 'Ambos %', 'Both %')], ['darkH', L(l, 'Noche h', 'Night h')], ['score', L(l, 'Punt.', 'Score')]]
  const csv = () => { const t = [cols.map(c => c[1]).join(','), ...rows.map(r => cols.map(([k]) => (r[k] <= 1 && k !== 'lat' && k !== 'lon' && k !== 'score' ? (r[k] * 100).toFixed(1) : r[k])).join(','))].join('\n'); const u = URL.createObjectURL(new Blob([t], {type: 'text/csv'})); Object.assign(document.createElement('a'), {href: u, download: 'sitios.csv'}).click() }
  return <Panel title={L(l, 'TABLA DE DATOS', 'DATA TABLE')} right={<button className="dl" onClick={csv}>⬇ CSV</button>}>
    <div className="cs"><table className="dt"><thead><tr>{cols.map(c => <th key={c[0]}>{c[1]}</th>)}</tr></thead><tbody>
      {rows.map(r => <tr key={r.n} className={r.n === sel ? 'on' : ''} onClick={() => onSelect(r.i)}>{cols.map(([k]) => <td key={k}>{['sun', 'earth', 'both'].includes(k) ? (r[k] * 100).toFixed(1) : r[k]}</td>)}</tr>)}</tbody></table></div>
  </Panel>
}

function Badges({l}) {
  return <div className="chips" role="status">
    <span className="chip off">{L(l, 'Efemérides: respaldo del prototipo', 'Ephemeris: prototype fallback')}</span>
    <span className="chip off">{L(l, 'Horizonte: modelo global', 'Horizon: global model')}</span>
    <span className="chip off">{L(l, 'Terreno: sin datos LOLA', 'Terrain: no LOLA data')}</span>
    <p className="hint">{L(l, 'Datos de ejemplo: se reemplazarán con el cálculo real (SPICE + LOLA).', 'Sample data: to be replaced by the real calculation (SPICE + LOLA).')}</p>
  </div>
}

export default function Sitios({l, site, setSite, mode}) {
  const easy = mode !== 'exp', rows = useMemo(() => SITES.map(metrics), []), a = rows[site]
  const p = {rows, sel: a.n, onSelect: setSite, l, easy}
  return <div className="detail-body cols-3">
    <PoleMap {...p}/><Metrics a={a} l={l} easy={easy}/><Ranking {...p}/>
    <div className="span-all"><Compare {...p}/></div>
    {!easy && <div className="span-all"><Table {...p}/></div>}
    <p className="all note2">{L(l, 'Datos de ejemplo: se reemplazarán con el cálculo real (SPICE + LOLA).', 'Sample data: will be replaced by the real calculation (SPICE + LOLA).')}</p>
  </div>
}
