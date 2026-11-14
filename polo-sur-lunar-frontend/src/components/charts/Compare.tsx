import { scaleBand, scaleLinear } from "d3";
import { useMemo } from "react";
import type { ReactElement } from "react";
import Panel from "../ui/Panel";
import type { SiteAnalysis } from "../../engine/index";
import { fmtHours, fmtPct, shortName } from "../../lib/format";
import { useT } from "../../i18n/i18n";

const W = 1000;
const ROW = 58;
const PAD_L = 150;
const PAD_R = 120;

interface Props {
  readonly analyses: readonly SiteAnalysis[];
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
}

export default function Compare({ analyses, selectedId, onSelect }: Props): ReactElement {
  const t = useT();
  const rows = useMemo(() => [...analyses].sort((a, b) => b.score - a.score), [analyses]);
  const H = rows.length * ROW + 24;
  const y = useMemo(() => scaleBand<string>().domain(rows.map((a) => a.site.id)).range([4, H - 20]).paddingInner(0.25), [rows, H]);
  const x = scaleLinear().domain([0, 1]).range([0, W - PAD_L - PAD_R]);
  const bars = [
    { key: "sun", label: t("cmp.sun"), color: "#FFC857", v: (a: SiteAnalysis) => a.metrics.sunPct },
    { key: "earth", label: t("cmp.earth"), color: "#6889F7", v: (a: SiteAnalysis) => a.metrics.earthPct },
    { key: "both", label: t("cmp.both"), color: "#7CF0C9", v: (a: SiteAnalysis) => a.metrics.bothPct },
  ] as const;

  return (
    <Panel title={t("cmp.title")} help={t("cmp.help")} right={<span className="muted small">{bars.map((b) => b.label).join(" · ")}</span>}>
      <div className="chart-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="group" aria-label={t("cmp.aria")}>
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <g key={p}>
            <line x1={PAD_L + x(p)} x2={PAD_L + x(p)} y1={0} y2={H - 18} stroke="rgba(255,255,255,0.1)" />
            <text x={PAD_L + x(p)} y={H - 4} className="axis" textAnchor="middle">{Math.round(p * 100)}%</text>
          </g>
        ))}
        {rows.map((a) => {
          const top = y(a.site.id) ?? 0;
          const bh = y.bandwidth() / 3;
          return (
            <g key={a.site.id} tabIndex={0} role="button" aria-label={t("cmp.row", { site: a.site.name, n: Math.round(a.score) })} aria-pressed={a.site.id === selectedId} style={{ cursor: "pointer" }}
               onClick={() => onSelect(a.site.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(a.site.id)}>
              {a.site.id === selectedId && <rect x={0} y={top - 3} width={W} height={y.bandwidth() + 6} rx={8} fill="rgba(255,255,255,0.06)" />}
              <text x={PAD_L - 10} y={top + y.bandwidth() / 2 + 4} className="axis" textAnchor="end" fontSize="12">{shortName(a.site.name)}</text>
              {bars.map((b, k) => (
                <g key={b.key}>
                  <rect x={PAD_L} y={top + k * bh} width={Math.max(1, x(b.v(a)))} height={bh - 2} rx={2} fill={b.color} />
                  <text x={PAD_L + x(b.v(a)) + 6} y={top + k * bh + bh - 4} className="axis" fontSize="10">{b.label} {fmtPct(b.v(a))}</text>
                </g>
              ))}
              <text x={W - PAD_R + 12} y={top + y.bandwidth() / 2 - 2} className="axis" fontSize="11">{Math.round(a.score)} pts</text>
              <text x={W - PAD_R + 12} y={top + y.bandwidth() / 2 + 14} className="axis" fontSize="10">{t("cmp.dark")} {fmtHours(a.metrics.longestDarkH)}</text>
            </g>
          );
        })}
      </svg>
      </div>
    </Panel>
  );
}
