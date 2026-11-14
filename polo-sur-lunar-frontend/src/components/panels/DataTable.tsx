import type { ReactElement } from "react";
import Panel from "../ui/Panel";
import type { SiteAnalysis } from "../../engine/index";
import { downloadText, metricsCsv } from "../../lib/csv";
import { fmtHours } from "../../lib/format";
import { useT } from "../../i18n/i18n";

interface Props {
  readonly analyses: readonly SiteAnalysis[];
  readonly selectedId: string;
  readonly startIso: string;
  readonly spanDays: number;
  readonly mask: number;
  readonly onSelect: (id: string) => void;
}

/** Tabla completa de métricas (modo Experto) con exportación a CSV. */
export default function DataTable({ analyses, selectedId, startIso, spanDays, mask, onSelect }: Props): ReactElement {
  const t = useT();
  const rows = [...analyses].sort((a, b) => b.score - a.score);

  return (
    <Panel
      title={t("dt.title")}
      right={
        <button type="button" className="pill-btn" onClick={() => downloadText(`lunar-sites-${startIso}-${spanDays}d.csv`, metricsCsv(rows, startIso, spanDays, mask))}>
          ↓ CSV
        </button>
      }
    >
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>{t("dt.site")}</th>
              <th>Lat</th>
              <th>Lon</th>
              <th>{t("dt.sun")}</th>
              <th>{t("dt.earth")}</th>
              <th>{t("dt.both")}</th>
              <th>{t("dt.maxDark")}</th>
              <th>{t("dt.maxSilence")}</th>
              <th>{t("dt.maxSunEl")}</th>
              <th>{t("dt.maxEarthEl")}</th>
              <th>{t("ui.score")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.site.id} className={a.site.id === selectedId ? "active" : ""} onClick={() => onSelect(a.site.id)}>
                <td>
                  <i className="swatch" style={{ background: a.color }} /> {a.site.name}
                </td>
                <td>{a.site.lat.toFixed(2)}</td>
                <td>{a.site.lon.toFixed(2)}</td>
                <td>{(a.metrics.sunPct * 100).toFixed(1)}</td>
                <td>{(a.metrics.earthPct * 100).toFixed(1)}</td>
                <td>{(a.metrics.bothPct * 100).toFixed(1)}</td>
                <td>{fmtHours(a.metrics.longestDarkH)}</td>
                <td>{fmtHours(a.metrics.longestBlackoutH)}</td>
                <td>{a.metrics.maxSunEl.toFixed(2)}°</td>
                <td>{a.metrics.maxEarthEl.toFixed(2)}°</td>
                <td>
                  <b>{a.score.toFixed(1)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
