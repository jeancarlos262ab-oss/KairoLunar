import React, {useMemo, useState} from 'react'
import * as d3 from 'd3'
import {SITES, dayLight} from './Screens.jsx'
import {Panel} from './Sitios.jsx'

const L = (l, es, en) => (l === 'es' ? es : en)
const COL = ['#FFC857', '#7CF0C9', '#6889F7', '#FF8A65', '#C792EA', '#4FC3F7'], DAYS = 30
const cl = v => Math.max(0, Math.min(1, v))
const sunF = (d, s) => cl(dayLight(d, s) / 100), earthF = (d, s) => cl(s.comm / 100 + .28 * Math.sin(d / 3 + s.seed))
const fd = (l, d) => new Date(Date.UTC(2026, 10, 14) + d * 864e5).toLocaleDateString(l, {day: 'numeric', month: 'short', timeZone: 'UTC'}).replace('.', '')
const stars = v => '★'.repeat(Math.round(v * 5)) + '☆'.repeat(5 - Math.round(v * 5))

// Mejor ventana de N días por sitio (datos de ejemplo; sustituir por bestWindows de @lsp/engine)
function plan(n) {
  const win = (s, st) => { const r = d3.range(st, st + n), sun = d3.mean(r, d => sunF(d, s)), earth = d3.mean(r, d => earthF(d, s)), both = d3.mean(r, d => Math.min(sunF(d, s), earthF(d, s))) * .8
    let run = 0, dark = 0; r.forEach(d => { run = sunF(d, s) < .35 ? run + 1 : 0; dark = Math.max(dark, run) })
    return {sun, earth, both, dark: dark * 24, score: Math.round(100 * (.55 * sun + .35 * earth + .1 * (1 - dark / n)))} }
  return SITES.map((s, i) => { const all = d3.range(0, DAYS - n + 1).map(st => ({st, ...win(s, st)})), b = d3.greatest(all, w => w.score)
    const flex = [1, 2, 3].filter(k => [b.st - k, b.st + k].every(x => !all[x] || b.score - all[x].score <= 4)).pop() || 0
    return {...b, s, i, n, flex, color: COL[i]} }).sort((a, b) => b.score - a.score).slice(0, 6)
}

function Planner({l, easy, site, n, setN, jump}) {
  const res = useMemo(() => plan(n), [n])
  return <Panel title={L(l, 'PLANIFICADOR DE ATERRIZAJE', 'LANDING PLANNER')} easy={easy} help={L(l, 'Elige cuántos días durará la misión. Te mostramos, para cada lugar, las fechas con más luz y más contacto con la Tierra. Toca una tarjeta para verla en el cielo.', 'Pick how many days the mission lasts. For each place we show the dates with the most light and Earth contact. Tap a card to see it in the sky.')}
    right={<div className="pills" role="group">{[3, 7, 14].map(d => <button key={d} className={'pill' + (n === d ? ' on' : '')} onClick={() => setN(d)}>{d} d</button>)}</div>}>
    <div className="panel-sub">{easy ? L(l, `Mejores ${n} días para cada lugar, de noviembre a diciembre 2026`, `Best ${n} days at each place, Nov–Dec 2026`) : L(l, `Ventana de ${n} d · ${DAYS} d analizados · puntuación = 0.55·Sol + 0.35·Tierra + 0.10·noche`, `${n} d window · ${DAYS} d analysed · score = 0.55·Sun + 0.35·Earth + 0.10·night`)}</div>
    <ol className="plan-list">{res.map((r, k) => (
      <li key={r.s.n}><button className={'plan-card' + (r.i === site ? ' active' : '')} onClick={() => jump(r)}>
        <div className="plan-top"><span className="rank-pos">{k + 1}</span><i className="swatch" style={{background: r.color}}/><span className="rank-name">{r.s.n}</span><span className="rank-score">{r.score}</span></div>
        <div className="plan-dates">{fd(l, r.st)} → {fd(l, r.st + r.n)}</div>
        <div className="plan-flex">{r.flex ? L(l, `Puedes mover la fecha ±${r.flex} d casi sin perder puntaje.`, `You can shift the date ±${r.flex} d with almost no loss.`) : L(l, 'Ventana estrecha: conviene respetar estas fechas.', 'Narrow window: stick to these dates.')}</div>
        {easy ? <><div className="plan-stars"><span>{L(l, 'Energía', 'Power')} <b>{stars(r.sun)}</b></span><span>{L(l, 'Contacto', 'Contact')} <b>{stars(r.earth)}</b></span></div>
          <p className="plan-text">{r.sun > .75 ? L(l, 'Mucha luz casi todos los días.', 'Plenty of light almost every day.') : L(l, 'Luz variable: hay que gestionar la batería.', 'Variable light: manage the battery.')}</p></>
        : <div className="plan-metrics"><span>☀ {Math.round(r.sun * 100)}%</span><span>🌍 {Math.round(r.earth * 100)}%</span><span>{L(l, 'ambos', 'both')} {Math.round(r.both * 100)}%</span><span>{L(l, 'noche', 'night')} {r.dark} h</span></div>}
      </button></li>))}</ol>
  </Panel>
}

function Heatmap({l, easy, site, day, pick}) {
  const W = 1000, LW = 170, PR = 16, RH = 14, RG = 2, GG = 12, TOP = 6, PW = W - LW - PR, cw = PW / DAYS, GH = RH * 2 + RG + GG, H = TOP + SITES.length * GH + 22
  const xOf = d => LW + d / DAYS * PW
  const click = e => { const b = e.currentTarget.getBoundingClientRect(), x = (e.clientX - b.left) / b.width * W, y = (e.clientY - b.top) / b.height * H
    pick(d3.clamp(Math.floor((y - TOP) / GH), 0, SITES.length - 1), d3.clamp(Math.floor((x - LW) / cw), 0, DAYS - 1) + .5) }
  return <Panel title={L(l, 'MAPA DE CALOR · 30 DÍAS', 'HEATMAP · 30 DAYS')} easy={easy} right={<span className="muted small">{L(l, 'toca un día', 'tap a day')}</span>}
    help={L(l, 'Cada fila es un lugar. Arriba (amarillo) = luz del Sol; abajo (azul) = Tierra visible. Cuanto más brillante el color, mejor ese día.', 'Each row is a place. Top (yellow) = sunlight; bottom (blue) = Earth visible. Brighter means better that day.')}>
    <div className="chart-scroll"><svg viewBox={`0 0 ${W} ${H}`} className="chart heat" role="img" aria-label="heatmap" onClick={click}>
      {SITES.map((s, i) => { const y0 = TOP + i * GH; return <g key={s.n}>
        {i === site && <rect x="0" y={y0 - 3} width={W} height={RH * 2 + RG + 6} className="row-active"/>}
        <text x={LW - 10} y={y0 + RH + 2} textAnchor="end" className={'row-label' + (i === site ? ' on' : '')}>{s.n}</text>
        {d3.range(DAYS).map(d => <g key={d}><rect x={LW + d * cw} y={y0} width={cw - .4} height={RH} className="cell sun" style={{opacity: .1 + .9 * sunF(d, s)}}/><rect x={LW + d * cw} y={y0 + RH + RG} width={cw - .4} height={RH} className="cell earth" style={{opacity: .1 + .9 * earthF(d, s)}}/></g>)}</g> })}
      {d3.range(7).map(k => <text key={k} x={xOf(k * 5)} y={H - 6} className="axis" textAnchor={k === 6 ? 'end' : 'middle'}>{fd(l, k * 5)}</text>)}
      <line x1={xOf(day)} x2={xOf(day)} y1="0" y2={H - 18} className="cursor"/>
    </svg></div>
    <div className="legend"><span><i className="dot sun"/>{L(l, 'arriba: Sol', 'top: Sun')}</span><span><i className="dot earth"/>{L(l, 'abajo: Tierra', 'bottom: Earth')}</span><span className="muted">{L(l, 'más brillante = mejor', 'brighter = better')}</span></div>
  </Panel>
}

export default function Calendario({l, site, setSite, mode, day, setDay}) {
  const [n, setN] = useState(7), easy = mode !== 'exp'
  return <div className="detail-body ty-home">
    <Planner l={l} easy={easy} site={site} n={n} setN={setN} jump={r => { setSite(r.i); setDay(r.st + .5) }}/>
    <Heatmap l={l} easy={easy} site={site} day={day} pick={(i, d) => { setSite(i); setDay(d) }}/>
  </div>
}
