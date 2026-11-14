import type { ReactElement } from "react";
import Panel from "../ui/Panel";
import type { SiteAnalysis } from "../../engine/index";
import { useEasy } from "../../state/mode";
import { fmtHours, fmtPct } from "../../lib/format";
import { useT } from "../../i18n/i18n";

interface BarProps {
  readonly label: string;
  readonly value: number; // 0..1
  readonly text: string;
  readonly tone: "sun" | "earth" | "dark";
}

function Bar({ label, value, text, tone }: BarProps): ReactElement {
  return (
    <div className="mini-bar">
      <span className="mini-label">{label}</span>
      <div className="mini-track">
        <div className={`mini-fill ${tone}`} style={{ width: `${Math.max(2, Math.min(1, value) * 100)}%` }} />
      </div>
      <span className="mini-val">{text}</span>
    </div>
  );
}

interface Props {
  readonly analyses: readonly SiteAnalysis[];
  readonly selectedId: string;
  readonly spanDays: number;
  readonly onSelect: (id: string) => void;
}

export default function Ranking({ analyses, selectedId, spanDays, onSelect }: Props): ReactElement {
  const easy = useEasy();
  const t = useT();
  const ranked = [...analyses].sort((a, b) => b.score - a.score);
  const spanH = spanDays * 24;

  return (
    <Panel
      title={t("rk.title")}
      help={t("rk.help")}
      right={<span className="muted small">{t("ui.window", { n: spanDays })}</span>}
    >
      <ol className="rank-list">
        {ranked.map((a, i) => (
          <li key={a.site.id}>
            <button type="button" className={`rank-card${a.site.id === selectedId ? " active" : ""}`} onClick={() => onSelect(a.site.id)}>
              <div className="rank-top">
                <span className="rank-pos">{i + 1}</span>
                <i className="swatch" style={{ background: a.color }} />
                <span className="rank-name">{a.site.name}</span>
                <span className="rank-score">{Math.round(a.score)}</span>
              </div>
              <Bar label={easy ? t("rk.sunshine") : t("rk.power")} value={a.metrics.sunPct} text={fmtPct(a.metrics.sunPct)} tone="sun" />
              <Bar label={easy ? t("rk.contact") : t("rk.comms")} value={a.metrics.earthPct} text={fmtPct(a.metrics.earthPct)} tone="earth" />
              <Bar label={easy ? t("rk.night") : t("rk.dark")} value={a.metrics.longestDarkH / spanH} text={fmtHours(a.metrics.longestDarkH)} tone="dark" />
            </button>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
