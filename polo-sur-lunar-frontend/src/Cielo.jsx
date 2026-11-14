import React, {useMemo} from 'react'
import * as d3 from 'd3'
import {SITES, horizon} from './Screens.jsx'
import {Panel} from './Sitios.jsx'

const L = (l, es, en) => (l === 'es' ? es : en)
const DEG = Math.PI / 180, STEP = .125, N = 241, SUN_R = .27 // 3 h por muestra, 30 días
const CARD = az => ({0: 'N', 90: 'E', 180: 'S', 270: 'O'}[az])

// Efemérides de ejemplo (sustituir por @lsp/engine): el Sol da la vuelta en ~29.5 d; la Tierra oscila (libración)
function series(s) {
  const a = d3.range(N).map(i => {
    const d = i * STEP, sunAz = (d * 12.19 + s.seed * 50) % 360, sunEl = (1.5 - s.seed * .08) * Math.cos((sunAz - s.seed * 50 - 20) * DEG) + .2
    const earthAz = (130 + 28 * Math.sin(2 * Math.PI * d / 27.3 + s.seed) + 360) % 360, earthEl = 6.5 * Math.sin(2 * Math.PI * d / 27.3 + s.seed * 1.3) - .4
    return {d, sunAz, sunEl, earthAz, earthEl, sunUp: sunEl + SUN_R > horizon(sunAz, s), earthUp: earthEl > horizon(earthAz, s)}
  })
  return a
}
const runs = (arr, f) => { const out = []; let st = -1; arr.forEach((v, i) => { const on = f(v); if (on && st < 0) st = i; if (!on && st >= 0) { out.push([st, i]); st = -1 } }); if (st >= 0) out.push([st, arr.length - 1]); return out }
const stamp = (l, d) => new Date(Date.UTC(2026, 10, 14, 12) + d * 864e5).toLocaleString(l, {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false}).replace('.', '') + ' UTC'
const STARS = (() => { const r = d3.randomLcg(11); return d3.range(110).map(() => ({x: r(), y: r(), r: .4 + r() * 1, o: .25 + r() * .6})) })()

function SkyPolar({s, ser, idx, l, easy}) {
  const SIZE = 460, C = SIZE / 2, R = 190, r = d3.scaleLinear([10, -3], [0, R]).clamp(true), cur = ser[idx]
  const g = useMemo(() => {
    const azs = d3.range(0, 360, 3), a = Math.max(0, idx - 24), b = Math.min(N - 1, idx + 24), w = ser.slice(a, b + 1)
    const trail = (k, e) => d3.lineRadial().angle(p => p[k] * DEG).radius(p => r(p[e]))(w)
    return {blocked: d3.areaRadial().angle(az => az * DEG).innerRadius(az => r(horizon(az, s))).outerRadius(R).curve(d3.curveLinearClosed)(azs), sun: trail('sunAz', 'sunEl'), earth: trail('earthAz', 'earthEl')}
  }, [s, idx])
  const at = (az, el) => [C + r(el) * Math.sin(az * DEG), C - r(el) * Math.cos(az * DEG)]
  const [sx, sy] = at(cur.sunAz, cur.sunEl), [ex, ey] = at(cur.earthAz, cur.earthEl)
  return <Panel title={L(l, 'DIAGRAMA POLAR DEL CIELO', 'SKY POLAR DIAGRAM')} easy={easy} help={L(l, 'Imagina que estás de pie en el sitio mirando hacia arriba: el centro es el cielo sobre ti y el borde está casi en el horizonte. Lo gris es la montaña que tapa. Si el Sol está sobre lo gris, hay luz.', 'Picture standing at the site looking up: centre is straight above, the edge is near the horizon. Grey is blocking terrain. If the Sun is above the grey, it is lit.')}>
    <div className="panel-sub">{s.n} · −3° … 10° · {stamp(l, cur.d)}</div>
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="chart" style={{maxHeight: 460}} role="img" aria-label={`${s.n}: ${cur.sunEl.toFixed(1)}°`}>
      <defs>
        <radialGradient id="sp-sky"><stop offset="0" stopColor="#02030a"/><stop offset=".7" stopColor="#060b1c"/><stop offset="1" stopColor="#14214a"/></radialGradient>
        <radialGradient id="sp-rock"><stop offset=".8" stopColor="#2a2b31"/><stop offset="1" stopColor="#0b0b0e"/></radialGradient>
        <radialGradient id="glow-s"><stop offset="0" stopColor="#ffc857" stopOpacity=".7"/><stop offset="1" stopColor="#ffc857" stopOpacity="0"/></radialGradient>
        <radialGradient id="glow-e"><stop offset="0" stopColor="#89e5fc" stopOpacity=".55"/><stop offset="1" stopColor="#89e5fc" stopOpacity="0"/></radialGradient>
        <clipPath id="sp-clip"><circle r={R}/></clipPath>
      </defs>
      <g transform={`translate(${C},${C})`}>
        <circle r={R} fill="url(#sp-sky)"/>
        <g clipPath="url(#sp-clip)">
          {STARS.map((t, i) => { const a = t.x * Math.PI * 2, rr = Math.sqrt(t.y) * R; return <circle key={i} cx={Math.sin(a) * rr} cy={-Math.cos(a) * rr} r={t.r} fill="#fff" opacity={t.o}/> })}
          <path d={g.blocked} fill="url(#sp-rock)"/>
        </g>
        <path d={g.blocked} fill="none" stroke="rgba(255,255,255,.45)"/>
        {[8, 6, 4, 2, 0, -2].map(e => <g key={e}><circle r={r(e)} fill="none" stroke="rgba(255,255,255,.12)" strokeDasharray={e ? '2 4' : undefined}/><text x="4" y={-r(e) - 2} className="axis" fontSize="9">{e}°</text></g>)}
        {[0, 90, 180, 270].map(az => <g key={az}><line x2={R * Math.sin(az * DEG)} y2={-R * Math.cos(az * DEG)} stroke="rgba(255,255,255,.12)"/><text x={(R + 14) * Math.sin(az * DEG)} y={-(R + 14) * Math.cos(az * DEG) + 4} className="axis" textAnchor="middle">{CARD(az)}</text></g>)}
        <path d={g.sun} fill="none" stroke="#FFC857" strokeWidth="2"/><path d={g.earth} fill="none" stroke="#6889F7" strokeWidth="2" strokeDasharray="6 4"/>
      </g>
      <circle cx={sx} cy={sy} r="26" fill="url(#glow-s)"/><circle cx={sx} cy={sy} r="9" fill="#ffc857"/>
      <circle cx={ex} cy={ey} r="22" fill="url(#glow-e)"/><circle cx={ex} cy={ey} r="9" fill="#3d63d8" stroke="#89E5FC"/>
      <text x={sx} y={sy - 15} className="tag" textAnchor="middle">{L(l, 'Sol', 'Sun')}</text><text x={ex} y={ey - 15} className="tag" textAnchor="middle">{L(l, 'Tierra', 'Earth')}</text>
    </svg>
    <div className="legend"><span><i className="dot sun"/>{L(l, 'Sol', 'Sun')} (―)</span><span><i className="dot earth"/>{L(l, 'Tierra', 'Earth')} (- -)</span><span className="muted">{L(l, 'Terreno: perfil del horizonte', 'Terrain: horizon profile')}</span></div>
  </Panel>
}

function Panorama({s, ser, idx, l, easy}) {
  const W = 1000, H = 300, PL = 46, PR = 16, PT = 14, PB = 36, cur = ser[idx]
  const px = a => PL + a / 360 * (W - PL - PR), py = d3.scaleLinear([8, -2], [PT, H - PB]).clamp(true)
  const ground = d3.line()(d3.range(0, 361, 3).map(a => [px(a), py(horizon(a % 360, s))])) + `L${px(360)},${H - PB}L${px(0)},${H - PB}Z`
  return <Panel title={L(l, 'PANORAMA DEL HORIZONTE', 'HORIZON PANORAMA')} easy={easy} help={L(l, 'Es lo que verías al girar 360° con la vista a ras del horizonte. Lo gris es el relieve; el Sol y la Tierra aparecen donde están ahora.', 'What you would see turning a full circle at eye level. Grey is the terrain; Sun and Earth appear where they are now.')} right={`${L(l, 'Azimut', 'Azimuth')} 0–360°`}>
    <div className="chart-scroll"><svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={L(l, 'Panorama', 'Panorama')}>
      <defs><linearGradient id="pn-ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4a4b52"/><stop offset="1" stopColor="#0d0d10"/></linearGradient></defs>
      <rect x={PL} y={PT} width={W - PL - PR} height={H - PB - PT} fill="#050914"/>
      {[6, 4, 2, 0, -2].map(e => <g key={e}><line x1={PL} x2={W - PR} y1={py(e)} y2={py(e)} className="grid"/><text x={PL - 8} y={py(e) + 3.5} className="axis" textAnchor="end">{e}°</text></g>)}
      {d3.range(0, 361, 45).map(a => <g key={a}><line x1={px(a)} x2={px(a)} y1={PT} y2={H - PB} className="grid faint"/><text x={px(a)} y={H - 12} className="axis" textAnchor="middle">{a % 90 === 0 ? CARD(a % 360) + ' ' : ''}{a}°</text></g>)}
      <path d={ground} fill="url(#pn-ground)"/><line x1={PL} x2={W - PR} y1={py(0)} y2={py(0)} className="horizon"/>
      <circle cx={px(cur.sunAz)} cy={py(cur.sunEl)} r="10" fill="#ffc857" stroke="#fff" strokeOpacity=".6"/><text x={px(cur.sunAz)} y={py(cur.sunEl) - 16} className="tag" textAnchor="middle">{L(l, 'Sol', 'Sun')} {cur.sunEl.toFixed(1)}°</text>
      <circle cx={px(cur.earthAz)} cy={py(cur.earthEl)} r="9" fill="#3d63d8" stroke="#89E5FC"/><text x={px(cur.earthAz)} y={py(cur.earthEl) - 15} className="tag" textAnchor="middle">{L(l, 'Tierra', 'Earth')} {cur.earthEl.toFixed(1)}°</text>
    </svg></div>
  </Panel>
}

function Timeline({s, ser, idx, l, easy, setDay, playing, setPlaying}) {
  const W = 1000, PL = 46, PR = 16, PW = W - PL - PR, SY = 12, SH = 12, SG = 6, PT = 70, PB = 300, H = 330
  const x = d3.scaleLinear([0, N - 1], [PL, PL + PW]), y = d3.scaleLinear([10, -8], [PT, PB]).clamp(true)
  const ln = k => d3.line().x((_, i) => x(i)).y(p => y(p[k]))(ser)
  const strips = [[L(l, 'Sol', 'Sun'), runs(ser, p => p.sunUp), 'sun'], [L(l, 'Tierra', 'Earth'), runs(ser, p => p.earthUp), 'earth'], [L(l, 'Ambos', 'Both'), runs(ser, p => p.sunUp && p.earthUp), 'both']]
  const scrub = e => { if (e.type === 'pointermove' && !e.buttons) return; const b = e.currentTarget.getBoundingClientRect(), f = Math.max(0, Math.min(1, ((e.clientX - b.left) / b.width * W - PL) / PW)); setDay(f * 30) }
  return <Panel title={L(l, 'LÍNEA DE TIEMPO', 'TIMELINE')} easy={easy} help={L(l, 'Las franjas de arriba se encienden cuando hay Sol (amarillo), Tierra (azul) o ambos (verde). Arrastra sobre el gráfico para mover la fecha.', 'The top strips light up when the Sun (yellow), Earth (blue) or both (green) are up. Drag on the chart to change the date.')}
    right={<button className="pill-btn" onClick={() => setPlaying(p => !p)}>{playing ? '❚❚ ' + L(l, 'PAUSA', 'PAUSE') : '▶ ' + L(l, 'REPRODUCIR', 'PLAY')}</button>}>
    <div className="panel-sub">{L(l, `Sol y Tierra sobre el horizonte en ${s.n}, 30 días`, `Sun and Earth above the horizon at ${s.n}, 30 days`)}</div>
    <svg viewBox={`0 0 ${W} ${H}`} className="chart scrub" onPointerDown={scrub} onPointerMove={scrub} role="slider" aria-label="timeline">
      {strips.map(([n, rs, c], k) => { const yy = SY + k * (SH + SG); return <g key={c}><rect x={PL} y={yy} width={PW} height={SH} className="strip-bg"/>{rs.map(([a, b]) => <rect key={a} x={x(a)} y={yy} width={Math.max(1, x(b) - x(a))} height={SH} className={'strip ' + c}/>)}<text x={PL - 8} y={yy + SH - .5} className="axis xs" textAnchor="end">{n}</text></g> })}
      {[8, 4, 0, -4, -8].map(e => <g key={e}><line x1={PL} x2={W - PR} y1={y(e)} y2={y(e)} className="grid"/><text x={PL - 8} y={y(e) + 3.5} className="axis" textAnchor="end">{e}°</text></g>)}
      <rect x={PL} y={y(0)} width={PW} height={PB - y(0)} className="below"/><line x1={PL} x2={W - PR} y1={y(0)} y2={y(0)} className="horizon"/>
      <path d={ln('earthEl')} className="line earth"/><path d={ln('sunEl')} className="line sun"/>
      {d3.range(7).map(k => <text key={k} x={PL + k / 6 * PW} y={H - 6} className="axis xs" textAnchor="middle">{stamp(l, k * 5).split(',')[0].replace(/ UTC/, '').replace(/\d{2}:\d{2}/, '').trim()}</text>)}
      <line x1={x(idx)} x2={x(idx)} y1={SY} y2={PB} className="cursor"/><circle cx={x(idx)} cy={y(ser[idx].sunEl)} r="4" className="cursor-dot"/>
    </svg>
    <div className="legend"><span><i className="dot sun"/>{L(l, 'Elevación del Sol', 'Sun elevation')}</span><span><i className="dot earth"/>{L(l, 'Elevación de la Tierra', 'Earth elevation')}</span></div>
  </Panel>
}

function Geometry({s, ser, idx, l}) {
  const c = ser[idx], dist = 384400 + 21000 * Math.sin(2 * Math.PI * c.d / 27.55), eDia = 2 * Math.asin(6371 / dist) / DEG
  const rows = [[L(l, 'Época', 'Epoch'), stamp(l, c.d)], [L(l, 'Sol Az / El', 'Sun Az / El'), `${c.sunAz.toFixed(2)}° / ${c.sunEl.toFixed(2)}°`], [L(l, 'Tierra Az / El', 'Earth Az / El'), `${c.earthAz.toFixed(2)}° / ${c.earthEl.toFixed(2)}°`],
    [L(l, 'Máscara de elevación', 'Elevation mask'), '0.0°'], [L(l, 'Distancia a la Tierra', 'Earth distance'), Math.round(dist).toLocaleString(l) + ' km'], [L(l, 'Diámetro de la Tierra', 'Earth diameter'), eDia.toFixed(2) + '°'],
    [L(l, 'Diámetro del Sol', 'Sun diameter'), '0.53°'], [L(l, 'Paso de tiempo', 'Time step'), `180 min · ${N} ${L(l, 'muestras', 'samples')}`]]
  return <Panel title={L(l, 'GEOMETRÍA', 'GEOMETRY')} right={<span className="muted small">{L(l, 'cuadro actual', 'current frame')}</span>}>
    <dl className="kv">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
  </Panel>
}

export default function Cielo({l, site, mode, day, setDay, playing, setPlaying}) {
  const s = SITES[site], ser = useMemo(() => series(s), [site]), idx = Math.max(0, Math.min(N - 1, Math.round(day / STEP)))
  const p = {s, ser, idx, l, easy: mode !== 'exp'}
  return <div className="detail-body">
    <SkyPolar {...p}/><Panorama {...p}/><Timeline {...p} setDay={setDay} playing={playing} setPlaying={setPlaying}/>
    {mode === 'exp' && <Geometry {...p}/>}
    <div className="chips" role="status"><span className="chip off">{L(l, 'Efemérides: respaldo del prototipo', 'Ephemeris: prototype fallback')}</span><span className="chip off">{L(l, 'Horizonte: modelo global', 'Horizon: global model')}</span><p className="hint">{L(l, 'Datos de ejemplo: se reemplazarán con el cálculo real (SPICE + LOLA).', 'Sample data: to be replaced by the real calculation (SPICE + LOLA).')}</p></div>
  </div>
}
