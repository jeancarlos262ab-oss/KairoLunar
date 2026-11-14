import type { ReactElement, ReactNode } from "react";
import type { SiteAnalysis, TimeGrid } from "../engine/index";
import Compare from "../components/charts/Compare";
import PoleMap from "../components/charts/PoleMap";
import Ranking from "../components/panels/Ranking";
import SiteMetrics from "../components/panels/SiteMetrics";
import DataTable from "../components/panels/DataTable";
import { useEasy } from "../state/mode";

interface Props {
  readonly analyses: readonly SiteAnalysis[];
  readonly selected: SiteAnalysis;
  readonly grid: TimeGrid;
  readonly timeMs: number;
  readonly mask: number;
  readonly spanDays: number;
  readonly startIso: string;
  readonly badge: ReactNode;
  readonly onSelect: (id: string) => void;
}

export default function SitesView({ analyses, selected, grid, timeMs, mask, spanDays, startIso, badge, onSelect }: Props): ReactElement {
  const expert = !useEasy();
  return (
    <div className="detail-body cols-3">
      <PoleMap analyses={analyses} selectedId={selected.site.id} grid={grid} timeMs={timeMs} mask={mask} onSelect={onSelect} />
      <SiteMetrics analysis={selected} spanDays={spanDays} />
      <Ranking analyses={analyses} selectedId={selected.site.id} spanDays={spanDays} onSelect={onSelect} />
      <div className="span-all">
        <Compare analyses={analyses} selectedId={selected.site.id} onSelect={onSelect} />
      </div>
      {expert && (
        <div className="span-all">
          <DataTable analyses={analyses} selectedId={selected.site.id} startIso={startIso} spanDays={spanDays} mask={mask} onSelect={onSelect} />
        </div>
      )}
      <div className="span-all">{badge}</div>
    </div>
  );
}
