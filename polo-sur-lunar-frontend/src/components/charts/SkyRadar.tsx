import type { ReactElement } from "react";
import { clamp } from "../../lib/format";
import { useT } from "../../i18n/i18n";

interface Props {
  readonly sunAz: number;
  readonly sunEl: number;
  readonly earthAz: number;
  readonly earthEl: number;
  readonly mask: number;
}

const C = 60;
const R = 52;
const EL_SPAN = 10;
const DEG = Math.PI / 180;

/** Radar de cielo: el norte arriba; el anillo grueso es el horizonte (0°), hacia el centro se sube, hacia afuera se baja. */
const radiusOf = (el: number): number => R * (1 - (clamp(el, -EL_SPAN, EL_SPAN) + EL_SPAN) / (2 * EL_SPAN));
const at = (az: number, el: number): { x: number; y: number } => {
  const r = radiusOf(el);
  return { x: C + r * Math.sin(az * DEG), y: C - r * Math.cos(az * DEG) };
};

export default function SkyRadar({ sunAz, sunEl, earthAz, earthEl, mask }: Props): ReactElement {
  const t = useT();
  const sun = at(sunAz, sunEl);
  const earth = at(earthAz, earthEl);
  const sunUp = sunEl + 0.267 > mask;
  const earthUp = earthEl > mask;

  return (
    <svg viewBox="0 0 120 120" role="img" aria-label={t("radar.aria")}>
      {[5, 0, -5, -10].map((el) => (
        <circle
          key={el}
          cx={C}
          cy={C}
          r={radiusOf(el)}
          fill="none"
          stroke="#ffffff"
          strokeOpacity={el === 0 ? 0.6 : 0.2}
          strokeWidth={el === 0 ? 1.1 : 0.6}
        />
      ))}
      <line x1={C - R} y1={C} x2={C + R} y2={C} stroke="#ffffff" strokeOpacity="0.18" strokeWidth="0.6" />
      <line x1={C} y1={C - R} x2={C} y2={C + R} stroke="#ffffff" strokeOpacity="0.18" strokeWidth="0.6" />
      <g className="radar-sweep">
        <path d={`M${C} ${C} L${C + R} ${C} A${R} ${R} 0 0 0 ${C + R * Math.cos(Math.PI / 4)} ${C - R * Math.sin(Math.PI / 4)} Z`} fill="#ffffff" fillOpacity="0.16" />
      </g>
      <text x={C} y="6" textAnchor="middle" fontSize="6" fill="#ffffff" fillOpacity="0.7" fontFamily="IBM Plex Mono, monospace">
        N
      </text>
      <text x={C + radiusOf(0) + 2} y={C - 2} fontSize="4.6" fill="#ffffff" fillOpacity="0.5">
        0°
      </text>

      <g opacity={earthUp ? 1 : 0.4}>
        <circle cx={earth.x} cy={earth.y} r="6" fill="#6889f7" fillOpacity="0.35" />
        <circle cx={earth.x} cy={earth.y} r="3" fill="#ffffff" />
      </g>
      <g opacity={sunUp ? 1 : 0.4}>
        <circle cx={sun.x} cy={sun.y} r="7" fill="#ffc857" fillOpacity="0.35" />
        <circle cx={sun.x} cy={sun.y} r="3.2" fill="#ffe29a" />
      </g>
    </svg>
  );
}
