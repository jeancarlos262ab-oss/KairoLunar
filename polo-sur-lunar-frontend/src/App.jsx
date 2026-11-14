import React, {useState, useEffect} from 'react'
import './App.css'
import Moon from './Moon.jsx'
import Polar from './Polar.jsx'

const T = {
  es: {nav:['INICIO','SITIOS','CIELO','TERRENO','CALENDARIO','APRENDER'], easy:'FÁCIL', exp:'EXPERTO', site:'Sitio',
    sunEl:'Elevación del Sol', earthEl:'Elevación de la Tierra', nextSun:'Próximo Evento solar', nextEarth:'Próxima Salida de la Tierra',
    state:'Estado', stateVal:'Con Sol, sin enlace', analysis:'Análisis', pred:'Predicciones', sunAbove:'Sol · sobre el horizonte',
    noSet:'El Sol no se pone en toda la ventana', soon:'A punto de oscurecer', longest:'Noche más larga', never:'Nunca en sombra en esta ventana',
    rec:'Recomendaciones', explore:'EXPLORAR', ask:'Dime qué quieres saber...', moon:'LUNA · POLO SUR', zoom:'ZOOM ×26.0'},
  en: {nav:['HOME','SITES','SKY','TERRAIN','CALENDAR','LEARN'], easy:'EASY', exp:'EXPERT', site:'Site',
    sunEl:'Sun elevation', earthEl:'Earth elevation', nextSun:'Next solar event', nextEarth:'Next Earthrise',
    state:'Status', stateVal:'Sunlit, no link', analysis:'Analysis', pred:'Predictions', sunAbove:'Sun · above horizon',
    noSet:'The Sun does not set in the whole window', soon:'About to go dark', longest:'Longest night', never:'Never in shadow in this window',
    rec:'Recommendations', explore:'EXPLORE', ask:'Ask me anything...', moon:'MOON · SOUTH POLE', zoom:'ZOOM ×26.0'}
}

const Icon = ({d, s = 14}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
const ICONS = {help:'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01', search:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
  bell:'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4', gear:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', x:'M6 6l12 12M18 6L6 18', plus:'M12 5v14M5 12h14',
  ext:'M7 17L17 7M8 7h9v9', full:'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', expand:'M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7'}

const Stat = ({k, v}) => <div className="stat"><span>{k}</span><b>{v}</b></div>

const SunPanel = () => (
  <svg viewBox="0 0 300 120" className="pred">
    <g stroke="#fff" strokeOpacity=".08">{[40,100,150,200,260].map(x=><line key={x} x1={x} y1="0" x2={x} y2="120"/>)}{[30,60,90].map(y=><line key={y} x1="0" y1={y} x2="300" y2={y}/>)}</g>
    <path d="M104 98 A21 21 0 0 1 146 98Z" fill="#ffc94d"/>
    <circle cx="125" cy="98" r="33" fill="none" stroke="#ffb820" strokeOpacity=".8"/>
    <circle cx="125" cy="98" r="48" fill="none" stroke="#ffb820" strokeOpacity=".3" strokeDasharray="2 3"/>
    <line x1="150" y1="98" x2="262" y2="86" stroke="#ffc94d" strokeDasharray="4 3"/><text x="210" y="72" className="ang">1.5°</text>
    <rect y="98" width="300" height="22" fill="url(#hatch)"/><line x1="0" y1="98" x2="300" y2="98" stroke="#ccc"/>
    <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#888" strokeWidth="1.2"/></pattern></defs>
  </svg>)

const NightPanel = () => (
  <svg viewBox="0 0 300 100" className="pred">
    <g stroke="#fff" strokeOpacity=".08">{[40,100,150,200,260].map(x=><line key={x} x1={x} y1="0" x2={x} y2="100"/>)}{[30,60].map(y=><line key={y} x1="0" y1={y} x2="300" y2={y}/>)}</g>
    <circle cx="155" cy="45" r="30" fill="none" stroke="#ccc" strokeWidth="1.5"/>
    <path d="M155 15 A30 30 0 0 0 155 75 A22 30 0 0 1 155 15Z" fill="#f2f2f2"/>
    <line x1="155" y1="10" x2="155" y2="80" stroke="#777" strokeDasharray="3 3"/>
    {[[70,30],[207,17],[258,50],[40,70]].map(([x,y],i)=><text key={i} x={x} y={y} fill="#aaa" fontSize="12">+</text>)}
    <rect y="82" width="300" height="18" fill="url(#hatch)"/><line x1="0" y1="82" x2="300" y2="82" stroke="#ccc"/>
  </svg>)

const Card = ({title, sub, name, msg, warn, children}) => (
  <div className="block">
    <h4>{title}</h4>
    <div className="viz">{children}<button className="ic ext"><Icon d={ICONS.ext}/></button></div>
    <div className="meta"><small>{sub}</small><b>{name}</b></div>
    <div className="note"><i className={warn ? 'w' : ''}>{warn ? '!' : '●'}</i>{msg}</div>
  </div>)

export default function App() {
  const [lang, setLang] = useState('es'), [mode, setMode] = useState('exp')
  const [playing, setPlaying] = useState(false), [day, setDay] = useState(0)
  const t = T[lang]
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setDay(d => (d + .1) % 30), 100)
    return () => clearInterval(id)
  }, [playing])
  const date = new Date(Date.UTC(2026, 10, 14, 12) + day * 864e5)
  const fmt = date.toLocaleDateString(lang, {day: 'numeric', month: 'short', timeZone: 'UTC'}).replace('.', '') + ', ' + String(date.getUTCHours()).padStart(2, '0') + ':00 UTC'

  return (
    <div className="app">
      <header>
        <div className="logo"><i/>LUNAR<span>POLO SUR</span></div>
        <nav>{t.nav.map((n, i) => <a key={n} className={i === 0 ? 'on' : ''}>{n}</a>)}</nav>
        <div className="tools">
          <div className="seg"><button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button><button className={lang === 'es' ? 'on' : ''} onClick={() => setLang('es')}>ES</button></div>
          <div className="seg"><button className={mode === 'easy' ? 'on' : ''} onClick={() => setMode('easy')}>{t.easy}</button><button className={mode === 'exp' ? 'on' : ''} onClick={() => setMode('exp')}>{t.exp}</button></div>
          {['help','search','bell','gear'].map(k => <button key={k} className="sq"><Icon d={ICONS[k]} s={16}/></button>)}
        </div>
      </header>

      <main>
        <section className="stage">
          <Moon/>
          <div className="inset">
            <div className="globe"><i/></div>
            <p>{t.moon}<br/><em>{t.zoom}</em></p>
          </div>
          <button className="explore">{t.explore}</button>
          <div className="bars">
            <div className="time">
              <button className="play" onClick={() => setPlaying(p => !p)}>{playing ? '❚❚' : '▶'}</button>
              <div><span>{fmt}</span><input type="range" min="0" max="30" step=".1" value={day} onChange={e => setDay(+e.target.value)}/></div>
            </div>
            <div className="ask"><i>✦</i><span>{t.ask}</span>{['help','full','expand'].map(k => <button key={k} className="sq sm"><Icon d={ICONS[k]}/></button>)}</div>
          </div>
        </section>

        <aside>
          <div className="row">
            <div className="panel site">
              <div className="top"><div><small>{t.site}</small><h3>SHACKLETON</h3></div><button className="ic big"><Icon d={ICONS.x}/></button></div>
              <div className="grid"><Stat k={t.sunEl} v="1.4°"/><Stat k={t.earthEl} v="-4.3°"/><Stat k={t.nextSun} v="—"/><Stat k={t.nextEarth} v="3.3 d"/></div>
              <div className="state"><div><small>{t.state}</small><b>{t.stateVal}</b></div><button className="ic big"><Icon d={ICONS.plus}/></button></div>
            </div>
            <div className="panel polar"><Polar/></div>
          </div>
          <div className="panel analysis">
            <div className="ah"><i>✦</i>{t.analysis}</div>
            <h4 className="sec">{t.pred}</h4>
            <Card sub={t.sunAbove} name="Shackleton" msg={t.noSet}><SunPanel/></Card>
            <Card title={t.soon} sub={t.longest} name="Shackleton" msg={t.never} warn><NightPanel/></Card>
            <h4 className="sec">{t.rec}</h4>
            <div className="viz globe3d"><svg viewBox="0 0 300 90"><g fill="none" stroke="#5b7bff" strokeWidth="1.2"><ellipse cx="150" cy="60" rx="45" ry="45"/><ellipse cx="150" cy="60" rx="20" ry="45"/><ellipse cx="150" cy="60" rx="45" ry="16"/></g></svg></div>
          </div>
        </aside>
      </main>
    </div>
  )
}
