import React, {useMemo} from 'react'
import * as d3 from 'd3'

const CX = 450, CY = 360, R = 285
const rng = d3.randomLcg(7)

const MARKERS = [
  {x:386,y:263,c:'#9bd34a',r:7,ring:'#6b7cff'}, {x:457,y:264,c:'#5b7bff',r:6,ring:'#5b7bff'},
  {x:452,y:302,c:'#b67cff',r:5,ring:'#e0a15a'}, {x:549,y:294,c:'#e0a15a',r:5,ring:'#e0a15a'},
  {x:588,y:346,c:'#e0a15a',r:5,ring:'#e0a15a'}, {x:422,y:360,c:'#7fa0ff',r:4,ring:'#e0a15a'},
  {x:458,y:363,c:'#f3e27a',r:4,ring:'#fff'}, {x:520,y:348,c:'#46d6c8',r:4,ring:'#46d6c8'}
]

export default function Moon({sunAngle=0}) {
  const craters = useMemo(() => {
    const out = []
    for (let i = 0; i < 330; i++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * (R - 6)
      const r = 3 + Math.pow(rng(), 3.2) * 46
      out.push({x: CX + Math.cos(a) * d, y: CY + Math.sin(a) * d, r})
    }
    return out.sort((a, b) => b.r - a.r)
  }, [])
  const ticks = d3.range(0, 360, 5)
  const rings = [60, 120, 180, 240]

  return (
    <svg viewBox="0 0 900 720" className="moon">
      <defs>
        <clipPath id="disk"><circle cx={CX} cy={CY} r={R}/></clipPath>
        <filter id="grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency=".035 .05" numOctaves="5" seed="4"/>
          <feColorMatrix values="0 0 0 0 .62  0 0 0 0 .6  0 0 0 0 .57  0 0 0 .95 -.1"/>
        </filter>
        <filter id="soft"><feGaussianBlur stdDeviation="9"/></filter>
        <radialGradient id="cr" cx=".42" cy=".42" r=".7">
          <stop offset="0" stopColor="#4d4b49"/><stop offset=".7" stopColor="#6d6a67"/><stop offset="1" stopColor="#c9c5be"/>
        </radialGradient>
        <radialGradient id="vig" cx=".5" cy=".5" r=".5">
          <stop offset=".78" stopColor="#000" stopOpacity="0"/><stop offset="1" stopColor="#000" stopOpacity=".55"/>
        </radialGradient>
      </defs>

      <g clipPath="url(#disk)">
        <rect width="900" height="720" fill="#7d7a76"/>
        <rect width="900" height="720" filter="url(#grain)" opacity=".9"/>
        {craters.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r={c.r} fill="url(#cr)" stroke="#d6d2ca" strokeOpacity=".55" strokeWidth={Math.max(.8, c.r / 14)}/>
            <path d={`M${c.x - c.r * .8},${c.y + c.r * .45} A${c.r},${c.r} 0 0 0 ${c.x + c.r * .5},${c.y + c.r * .85}`} stroke="#fff" strokeOpacity=".5" strokeWidth={c.r / 12} fill="none"/>
          </g>
        ))}
        <circle cx={CX} cy={CY} r={R} fill="url(#vig)"/>
        <polygon points="0,0 722,0 182,720 0,720" fill="#0b1226" opacity=".86" filter="url(#soft)"/>
        <polygon points="0,0 722,0 182,720 0,720" fill="#1a2447" opacity=".22"/>
      </g>

      {rings.map(r => <circle key={r} cx={CX} cy={CY} r={r} fill="none" stroke="#fff" strokeOpacity=".07"/>)}
      <circle cx={CX} cy={CY} r={R + 1} fill="none" stroke="#e9e9e9" strokeOpacity=".9" strokeWidth="1.2"/>
      <circle cx={CX} cy={CY} r={R + 13} fill="none" stroke="#fff" strokeOpacity=".25"/>
      {ticks.map(a => {
        const rad = (a - 90) * Math.PI / 180, big = a % 30 === 0, r1 = R + 13, r2 = r1 + (big ? 9 : 4)
        return <line key={a} x1={CX + Math.cos(rad) * r1} y1={CY + Math.sin(rad) * r1} x2={CX + Math.cos(rad) * r2} y2={CY + Math.sin(rad) * r2} stroke="#fff" strokeOpacity={big ? .5 : .25}/>
      })}
      <g className="lbl">
        <text x={CX + 8} y={CY - R - 24}>0°</text>
        <text x={CX - R - 44} y={CY + 4} textAnchor="middle">90°O</text>
        <text x={CX + R + 24} y={CY + 4} textAnchor="start">90°E</text>
        <text x={CX} y={CY + R + 32} textAnchor="middle">180°</text>
      </g>

      <line x1={CX} y1={70} x2={CX} y2={CY} stroke="#5b7bff" strokeOpacity=".6" strokeDasharray="3 3"/>
      <circle cx={447} cy={69} r="9" fill="#5b8cff" stroke="#9db7ff" strokeWidth="2"/>
      <circle cx={709} cy={510} r="7" fill="#ffb820"/><circle cx={709} cy={510} r="12" fill="none" stroke="#ffb820"/>

      {MARKERS.map((m, i) => (
        <g key={i}><circle cx={m.x} cy={m.y} r={m.r + 5} fill="none" stroke={m.ring} strokeOpacity=".85"/><circle cx={m.x} cy={m.y} r={m.r - 1} fill={m.c}/></g>
      ))}
      <circle cx={448} cy={372} r="11" fill="#2b2f33" stroke="#e8e8e8" strokeWidth="1.5"/>
      <circle cx={448} cy={372} r="19" fill="none" stroke="#e8e8e8" strokeOpacity=".8"/>
      <circle cx={448} cy={372} r="5" fill="#46c7e8"/>
      <text x={370} y={353} className="site-lbl">Shackleton Connecting Ridge</text>
    </svg>
  )
}
