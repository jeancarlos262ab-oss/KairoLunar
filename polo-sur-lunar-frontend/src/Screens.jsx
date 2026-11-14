import React, {useEffect, useRef, useState} from 'react'
import * as d3 from 'd3'
import Sitios from './Sitios.jsx'
import Cielo from './Cielo.jsx'
import Calendario from './Calendario.jsx'
import Aprender from './Aprender.jsx'

const L = (l, es, en) => (l === 'es' ? es : en)
// Datos de ejemplo (sustituir por los calculados con SPICE/LOLA)
export const SITES = [
  {n: 'Shackleton', light: 86, comm: 38, dark: 2, seed: 0},
  {n: 'Connecting Ridge', light: 92, comm: 45, dark: 1, seed: 1},
  {n: 'de Gerlache Rim', light: 64, comm: 52, dark: 6, seed: 2},
  {n: 'Malapert', light: 55, comm: 90, dark: 8, seed: 3},
  {n: 'Nobile Rim', light: 71, comm: 60, dark: 5, seed: 4},
  {n: 'Cabeus', light: 38, comm: 41, dark: 12, seed: 5},
]
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v))
export const dayLight = (d, s) => clamp(s.light + 22 * Math.sin(d / 4.7 + s.seed * 1.7))
export const horizon = (az, s) => Math.max(0, 1.4 + 1.1 * Math.sin(az / 23 + s.seed) + .8 * Math.sin(az / 7 + s.seed * 2) + .5 * Math.sin(az / 3))
const sky = (d, s) => { const az = (d * 12.2) % 360; return {az, el: 1.5 * Math.cos((az - s.seed * 50) * Math.PI / 180) + .3, eaz: (40 + d * 3 + s.seed * 30) % 360, eel: 6 * Math.sin(d / 9 + s.seed) } }

const Head = ({t, sub}) => <div className="sh"><h2>{t}</h2><p>{sub}</p></div>
const Pick = ({l, site, setSite}) => (
  <label className="pick">{L(l, 'Lugar', 'Place')}
    <select value={site} onChange={e => setSite(+e.target.value)}>{SITES.map((s, i) => <option key={i} value={i}>{s.n}</option>)}</select></label>)
const Bar = ({v, c}) => <div className="bar"><i style={{width: v + '%', background: c}}/><b>{v}%</b></div>
const Tip = ({children}) => <div className="tip">💡 {children}</div>

function Terreno({l, site, setSite}) {
  const ref = useRef(), s = SITES[site]
  useEffect(() => {
    const svg = d3.select(ref.current); svg.selectAll('*').remove()
    const W = 760, H = 260, m = 36, x = d3.scaleLinear([0, 360], [m, W - 10]), y = d3.scaleLinear([0, 4], [H - 30, 10]), pts = d3.range(0, 361, 2)
    svg.append('rect').attr('x', m).attr('y', y(1.5)).attr('width', W - m - 10).attr('height', y(0) - y(1.5)).attr('fill', '#ffb820').attr('opacity', .08)
    svg.append('path').datum(pts).attr('d', d3.area().x(a => x(a)).y0(y(0)).y1(a => y(horizon(a, s)))).attr('fill', '#777').attr('opacity', .6)
    svg.append('path').datum(pts).attr('d', d3.line().x(a => x(a)).y(a => y(horizon(a, s)))).attr('fill', 'none').attr('stroke', '#ddd')
    svg.append('line').attr('x1', m).attr('x2', W - 10).attr('y1', y(1.5)).attr('y2', y(1.5)).attr('stroke', '#ffb820').attr('stroke-dasharray', '5 4')
    svg.append('text').attr('x', W - 14).attr('y', y(1.5) - 6).attr('text-anchor', 'end').attr('fill', '#ffb820').attr('font-size', 11).text(L(l, 'Altura máx. del Sol (1.5°)', 'Max Sun height (1.5°)'))
    svg.append('g').attr('transform', `translate(0,${H - 30})`).call(d3.axisBottom(x).tickValues([0, 90, 180, 270, 360]).tickFormat(a => ({0: 'N', 90: 'E', 180: 'S', 270: 'O', 360: 'N'}[a]))).attr('color', '#888')
    svg.append('g').attr('transform', `translate(${m},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(v => v + '°')).attr('color', '#888')
  }, [site, l])
  const blockedPct = Math.round(d3.range(0, 360, 2).filter(a => horizon(a, s) > 1.5).length / 1.8)
  return <>
    <Head t={L(l, 'El terreno que rodea el sitio', 'The terrain around the site')} sub={L(l, 'Vista lateral del horizonte, dando una vuelta completa. Lo gris son las montañas.', 'Side view of the horizon all the way round. Grey = mountains.')}/>
    <Pick l={l} site={site} setSite={setSite}/><svg ref={ref} viewBox="0 0 760 260" className="plot wide"/>
    <div className="say ok">⛰ {L(l, `Las montañas superan al Sol en el ${blockedPct}% de las direcciones.`, `Mountains rise above the Sun in ${blockedPct}% of directions.`)}</div>
    <Tip>{L(l, 'Si el Sol pasa por una zona donde la montaña sube más que la línea amarilla, queda tapado y hay sombra.', 'When the Sun passes where the mountain pokes above the yellow line, it is hidden and you get shadow.')}</Tip>
  </>
}

export default function Screens({screen, lang, site, setSite, go, mode, day, setDay, playing, setPlaying}) {
  const p = {l: lang, site, setSite, go, mode, day, setDay, playing, setPlaying}
  if (screen === 1) return <Sitios key={screen} {...p}/>
  if (screen === 2) return <Cielo key={screen} {...p}/>
  if (screen === 4) return <Calendario key={screen} {...p}/>
  if (screen === 5) return <Aprender key={screen} {...p}/>
  return <div className="detail-body" key={screen}><div className="pn">{[null, null, <Cielo {...p}/>, <Terreno {...p}/>][screen]}</div></div>
}
