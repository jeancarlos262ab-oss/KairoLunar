import type { ReactElement } from "react";
import { useT } from "../../i18n/i18n";

interface Props {
  readonly variant: "sun" | "night" | "earth";
}

const LINE = "rgba(255,255,255,0.55)";
const MONO = { fontFamily: "'IBM Plex Mono', monospace", fontSize: 6.5, fill: "rgba(255,255,255,0.7)" } as const;

/** Esquemas técnicos de línea fina para las tarjetas de insights: horizonte rayado, retícula y datos. */
export default function InsightArt({ variant }: Props): ReactElement {
  const t = useT();
  return (
    <svg className="sat-art" viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <pattern id="ia-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
        </pattern>
      </defs>

      {/* retícula de fondo */}
      {[40, 80, 120, 160].map((x) => (
        <line key={x} x1={x} y1="0" x2={x} y2="120" stroke="rgba(255,255,255,0.06)" />
      ))}
      {[24, 48, 72].map((y) => (
        <line key={y} x1="0" y1={y} x2="200" y2={y} stroke="rgba(255,255,255,0.06)" />
      ))}

      {/* regolito: línea de horizonte con rayado y marcas de escala */}
      <rect x="0" y="84" width="200" height="36" fill="url(#ia-hatch)" />
      <line x1="0" y1="84" x2="200" y2="84" stroke={LINE} strokeWidth="1" />
      {Array.from({ length: 21 }, (_, i) => (
        <line key={i} x1={i * 10} y1="84" x2={i * 10} y2={i % 5 === 0 ? 79 : 81.5} stroke={LINE} strokeWidth="0.6" />
      ))}

      {variant === "sun" && (
        <g>
          <circle cx="100" cy="84" r="34" fill="none" stroke="#ffc857" strokeOpacity="0.25" strokeDasharray="2 3" />
          <circle cx="100" cy="84" r="24" fill="none" stroke="#ffc857" strokeOpacity="0.5" />
          <path d="M86 84a14 14 0 0 1 28 0z" fill="#ffc857" />
          <path d="M100 84 L172 78" stroke="#ffc857" strokeWidth="0.8" strokeDasharray="3 3" />
          <path d="M130 84a30 30 0 0 0-1.5-5" fill="none" stroke="#ffc857" />
          <text x="136" y="74" {...MONO}>1.5°</text>
          <text x="6" y="14" {...MONO}>{t("ia.sun")}</text>
        </g>
      )}

      {variant === "night" && (
        <g>
          {([
            [30, 20],
            [160, 14],
            [120, 34],
            [58, 40],
            [178, 52],
            [18, 62],
          ] as ReadonlyArray<readonly [number, number]>).map(([x, y]) => (
            <path key={`${x}-${y}`} d={`M${x - 2} ${y}h4M${x} ${y - 2}v4`} stroke="rgba(255,255,255,0.7)" strokeWidth="0.8" />
          ))}
          <circle cx="100" cy="46" r="22" fill="none" stroke={LINE} />
          <path d="M100 24a22 22 0 0 0 0 44a14 22 0 0 1 0-44z" fill="#e6e6e6" />
          <line x1="100" y1="16" x2="100" y2="76" stroke="rgba(255,255,255,0.25)" strokeDasharray="2 3" />
          <text x="6" y="14" {...MONO}>{t("ia.night")}</text>
        </g>
      )}

      {variant === "earth" && (
        <g>
          <circle cx="100" cy="52" r="26" fill="#000" stroke="#6889f7" strokeWidth="1.2" />
          <ellipse cx="100" cy="52" rx="11" ry="26" fill="none" stroke="#6889f7" strokeOpacity="0.6" />
          <line x1="100" y1="26" x2="100" y2="78" stroke="#6889f7" strokeOpacity="0.6" />
          <ellipse cx="100" cy="52" rx="26" ry="9" fill="none" stroke="#6889f7" strokeOpacity="0.6" />
          <line x1="74" y1="52" x2="126" y2="52" stroke="#6889f7" strokeOpacity="0.35" />
          <path d="M100 78 V84" stroke={LINE} />
          <text x="6" y="14" {...MONO}>{t("ia.earth")}</text>
        </g>
      )}
    </svg>
  );
}
