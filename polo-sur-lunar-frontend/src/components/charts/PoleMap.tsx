import { memo, useMemo } from "react";
import type { KeyboardEvent } from "react";
import type { ReactElement } from "react";
import Panel from "../ui/Panel";
import { sampleIndex, subPoint, SUN_SEMIDIAMETER_DEG } from "../../engine/index";
import type { SiteAnalysis, TimeGrid } from "../../engine/index";
import { capDataUrl } from "../globe/moonSurface";
import { useT } from "../../i18n/i18n";
import { lonLabel } from "../../lib/format";

const SIZE = 320;
const C = SIZE / 2;
const R = 122; // radio = 10° de latitud (90°S → 80°S)
const LAT_SPAN = 10;
const DEG = Math.PI / 180;

/** Proyección polar: 0° de longitud arriba, longitud este en sentido horario (vista desde fuera, sobre el polo sur). */
function project(lat: number, lon: number): { x: number; y: number } {
  const r = ((lat + 90) / LAT_SPAN) * R;
  return { x: C + r * Math.sin(lon * DEG), y: C - r * Math.cos(lon * DEG) };
}

interface Props {
  readonly analyses: readonly SiteAnalysis[];
  readonly selectedId: string;
  readonly grid: TimeGrid;
  readonly timeMs: number;
  readonly mask: number;
  readonly onSelect: (id: string) => void;
}

function PoleMap({ analyses, selectedId, grid, timeMs, mask, onSelect }: Props): ReactElement {
  const t = useT();
  const idx = sampleIndex(grid, timeMs);
  const frame = grid.frames[idx];
  const sunLon = frame ? subPoint(frame.sun).lon : 0;
  const earthLon = frame ? subPoint(frame.earth).lon : 0;
  const rim = (lon: number): { x: number; y: number } => ({ x: C + R * Math.sin(lon * DEG), y: C - R * Math.cos(lon * DEG) });
  const sunRim = rim(sunLon);
  const earthRim = rim(earthLon);

  const sunKey = frame ? frame.sun.map((v) => v.toFixed(4)).join(",") : "";
  // superficie lunar con el día/noche real de esta fecha (mismo casquete de 10° que el mapa)
  const surface = useMemo(() => capDataUrl(frame?.sun, mask - SUN_SEMIDIAMETER_DEG, LAT_SPAN, "equi"), [sunKey, mask]);
  const labelStyle = { paintOrder: "stroke", stroke: "#000", strokeWidth: 3, strokeLinejoin: "round" } as const;

  const sites = useMemo(
    () =>
      analyses
        .map((a) => ({
          a,
          p: project(a.site.lat, a.site.lon),
          selected: a.site.id === selectedId,
          sunLit: (a.series.sunEl[idx] ?? -90) + SUN_SEMIDIAMETER_DEG > mask,
          earthUp: (a.series.earthEl[idx] ?? -90) > mask,
        }))
        .sort((x, y) => Number(x.selected) - Number(y.selected)), // el seleccionado se dibuja encima
    [analyses, selectedId, idx, mask],
  );

  const rings = [-88, -86, -84, -82, -80];
  const spokes = Array.from({ length: 12 }, (_, k) => k * 30);

  return (
    <Panel
      title={t("pm.title")}
      help={t("pm.help")}
      right={<span className="muted small">{t("pm.range")}</span>}
    >
      <svg className="map" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={t("pm.aria")}>
        <circle cx={C} cy={C} r={R} className="map-disc" />
        <image href={surface} x={C - R} y={C - R} width={R * 2} height={R * 2} />
        <circle cx={C} cy={C} r={R} fill="none" stroke="rgba(255,255,255,0.45)" />
        {rings.map((lat) => (
          <g key={lat}>
            <circle cx={C} cy={C} r={((lat + 90) / LAT_SPAN) * R} className="grid" fill="none" style={{ stroke: "rgba(255,255,255,0.22)" }} />
            <text x={C + ((lat + 90) / LAT_SPAN) * R * Math.SQRT1_2 + 3} y={C - ((lat + 90) / LAT_SPAN) * R * Math.SQRT1_2 - 2} className="axis xs" style={labelStyle}>
              {Math.abs(lat)}°S
            </text>
          </g>
        ))}
        {spokes.map((lon) => {
          const p = rim(lon);
          return <line key={lon} x1={C} y1={C} x2={p.x} y2={p.y} className="grid faint" />;
        })}
        {[
          { lon: 0, label: "0°" },
          { lon: 90, label: lonLabel(90, 0) },
          { lon: 180, label: "180°" },
          { lon: 270, label: lonLabel(-90, 0) },
        ].map(({ lon, label }) => {
          const r = R + 15;
          return (
            <text key={label} x={C + r * Math.sin(lon * DEG)} y={C - r * Math.cos(lon * DEG) + 3.5} className="axis" textAnchor="middle" style={labelStyle}>
              {label}
            </text>
          );
        })}

        {/* meridianos subsolar y subterrestre */}
        <line x1={C} y1={C} x2={sunRim.x} y2={sunRim.y} className="ray sun" />
        <line x1={C} y1={C} x2={earthRim.x} y2={earthRim.y} className="ray earth" />
        <g className="rim-marker">
          <circle cx={sunRim.x} cy={sunRim.y} r="7" className="fill-sun" />
          <text x={sunRim.x} y={sunRim.y + 2.6} textAnchor="middle" className="rim-glyph">☉</text>
        </g>
        <g className="rim-marker">
          <circle cx={earthRim.x} cy={earthRim.y} r="7" className="fill-earth" />
          <text x={earthRim.x} y={earthRim.y + 2.6} textAnchor="middle" className="rim-glyph">⊕</text>
        </g>

        {sites.map(({ a, p, selected, sunLit, earthUp }) => {
          const above = p.y > SIZE - 34; // cerca del borde inferior la etiqueta va arriba
          const tx = Math.min(SIZE - 6, Math.max(6, p.x));
          const status = `${sunLit ? t("pm.site.sun") : t("pm.site.nosun")} · ${earthUp ? t("pm.site.earth") : t("pm.site.noearth")}`;
          const onKey = (e: KeyboardEvent<SVGGElement>): void => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect(a.site.id);
            }
          };
          return (
            <g
              key={a.site.id}
              className={`map-site${selected ? " is-selected" : ""}`}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={`${a.site.name}: ${status}${selected ? ` (${t("pm.selected")})` : ""}`}
              onClick={() => onSelect(a.site.id)}
              onKeyDown={onKey}
            >
              <title>{a.site.name}</title>
              <circle cx={p.x} cy={p.y} r={16} className="hit" />
              {selected && <circle cx={p.x} cy={p.y} r={18} className="pulse" />}
              {earthUp && <circle cx={p.x} cy={p.y} r={selected ? 15 : 12} className="halo earth" />}
              {sunLit && <circle cx={p.x} cy={p.y} r={selected ? 10.5 : 8.5} className="halo sun" />}
              <circle cx={p.x} cy={p.y} r={selected ? 5.5 : 4} fill={a.color} className="dot-core" />
              <text x={tx} y={above ? p.y - 20 : p.y + 25} className={selected ? "tag" : "tag hover-tag"} textAnchor="middle" style={labelStyle}>
                {a.site.name}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="legend">
        <span>
          <i className="dot sun" /> {t("pm.sunlit")}
        </span>
        <span>
          <i className="dot earth" /> {t("pm.earthview")}
        </span>
        <span className="muted">{t("pm.rays")}</span>
      </div>
    </Panel>
  );
}

export default memo(PoleMap);
