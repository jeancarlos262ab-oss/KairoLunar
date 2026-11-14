import type { ReactElement } from "react";
import type { TimeGrid } from "../../engine/index";
import type { DataSources } from "../../services/dataSources";
import { useT } from "../../i18n/i18n";

interface Props {
  readonly data: DataSources | null;
  readonly grid: TimeGrid;
  readonly lhorSites: number;
  readonly totalSites: number;
}

/** Hace visible de dónde salen los números: archivos del pipeline (reproducibles) o el respaldo del prototipo. */
export default function DataBadge({ data, grid, lhorSites, totalSites }: Props): ReactElement {
  const t = useT();
  const leph = grid.source === "leph";
  const lhor = lhorSites > 0;
  const terrain = data?.terrain != null;
  return (
    <div className="data-badges" role="status">
      <span className={`chip ${leph ? "ok" : "off"}`}>{leph ? t("data.eph.leph") : t("data.eph.fallback")}</span>
      <span className={`chip ${lhor ? "ok" : "off"}`}>
        {lhor ? `${t("data.hor.lhor")} · ${lhorSites}/${totalSites}` : t("data.hor.global")}
      </span>
      <span className={`chip ${terrain ? "ok" : "off"}`}>{terrain ? t("data.terrain.yes") : t("data.terrain.no")}</span>
      {!(leph && lhor && terrain) && <p className="hint small muted">{t("data.hint")}</p>}
    </div>
  );
}
