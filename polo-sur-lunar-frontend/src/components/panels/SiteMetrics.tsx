import type { ReactElement } from "react";
import Panel from "../ui/Panel";
import Stars from "../ui/Stars";
import type { SiteAnalysis } from "../../engine/index";
import { fmtDeg, fmtHours, fmtPct, latLabel, lonLabel } from "../../lib/format";
import { useT } from "../../i18n/i18n";
import { useEasy } from "../../state/mode";
import { verdictFor } from "../../lib/verdict";

interface Props {
  readonly analysis: SiteAnalysis;
  readonly spanDays: number;
}

export default function SiteMetrics({ analysis, spanDays }: Props): ReactElement {
  const easy = useEasy();
  const t = useT();
  const { site, metrics: m } = analysis;

  const head = (
    <div className="site-head">
      <i className="swatch big" style={{ background: analysis.color }} />
      <div>
        <div className="site-name">{site.name}</div>
        <div className="muted small">
          {latLabel(site.lat)} · {lonLabel(site.lon)}
          {site.custom ? ` · ${t("site.custom")}` : site.note ? ` · ${site.note}` : ""}
        </div>
      </div>
    </div>
  );

  if (easy) {
    const v = verdictFor(m, t);
    return (
      <Panel
        title={t("sm.title")}
        help={t("sm.help")}
        right={<span className="muted small">{t("ui.window", { n: spanDays })}</span>}
      >
        {head}
        <p className="verdict-line">{v.headline}</p>
        <ul className="verdict-list">
          <li>
            <div className="vl-top">
              <span>{t("sm.power")}</span>
              <Stars value={v.power} label={t("sm.power")} />
            </div>
            <p>{v.powerText}</p>
          </li>
          <li>
            <div className="vl-top">
              <span>{t("sm.comms")}</span>
              <Stars value={v.comms} label={t("sm.comms")} />
            </div>
            <p>{v.commsText}</p>
          </li>
          <li>
            <div className="vl-top">
              <span>{t("sm.night")}</span>
              <Stars value={v.resilience} label={t("sm.night")} />
            </div>
            <p>{v.darkText}</p>
          </li>
        </ul>
        <div className="both-note">
          {t("sm.both.pre")} <b>{fmtPct(m.bothPct)}</b> {t("sm.both.post")}
        </div>
      </Panel>
    );
  }

  const items: ReadonlyArray<{ readonly label: string; readonly value: string; readonly tone?: "sun" | "earth" }> = [
    { label: t("sm.sunAbove"), value: fmtPct(m.sunPct), tone: "sun" },
    { label: t("metric.sunEnergy"), value: fmtPct(m.sunEnergyPct), tone: "sun" },
    { label: t("sm.earthDirect"), value: fmtPct(m.earthPct), tone: "earth" },
    { label: t("sm.sunEarth"), value: fmtPct(m.bothPct) },
    { label: t("sm.longDark"), value: fmtHours(m.longestDarkH), tone: "sun" },
    { label: t("sm.longBlack"), value: fmtHours(m.longestBlackoutH), tone: "earth" },
    { label: t("sm.maxSun"), value: fmtDeg(m.maxSunEl, 2), tone: "sun" },
    { label: t("sm.maxEarth"), value: fmtDeg(m.maxEarthEl, 2), tone: "earth" },
    { label: t("ui.score"), value: String(Math.round(analysis.score)) },
  ];

  return (
    <Panel title={t("sm.title")} right={<span className="muted small">{t("ui.window", { n: spanDays })}</span>}>
      {head}
      <dl className="stat-grid">
        {items.map((it) => (
          <div className="stat-cell" key={it.label}>
            <dt>{it.label}</dt>
            <dd className={it.tone ?? ""}>{it.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
