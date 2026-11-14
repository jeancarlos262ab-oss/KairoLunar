import { useState } from "react";
import type { ReactElement } from "react";
import Panel from "../components/ui/Panel";
import DataBadge from "../components/ui/DataBadge";
import { fmtDeg } from "../lib/format";
import { useT } from "../i18n/i18n";
import { useMemoryState } from "../hooks/useMemoryState";

type View = "oblique" | "top" | "site" | null;

interface Props {
  readonly analyses: readonly any[];
  readonly selectedId: string;
  readonly grid: any;
  readonly idx: number;
}

/**
 * Pestaña TERRAIN con la misma estructura que base (panel, ayuda, exageración, barra de vistas, HUD, leyenda
 * e insignias de datos). El área del terreno (3D y respaldo 2D) se deja VACÍA a propósito: ahí irá Terrain3D/Terrain2D.
 */
export default function TerrainView({ analyses, selectedId, grid, idx }: Props): ReactElement {
  const t = useT();
  const [exag, setExag] = useMemoryState<number>("terrain:exag", 2);
  const [view, setView] = useMemoryState<View>("terrain:view", "oblique");
  const [rings, setRings] = useMemoryState<boolean>("terrain:rings", true);
  const [, setTick] = useState<number>(0);
  const selected = analyses.find((a) => a.site.id === selectedId) ?? analyses[0];
  const stepKm = 20; // extensión por defecto del terreno: 160 km
  const go = (v: Exclude<View, null>): void => {
    setView(v);
    setTick((n) => n + 1);
  };

  return (
    <div className="detail-body">
      <Panel
        title={t("terrain.title")}
        help={t("terrain.help")}
        right={
          <label className="terr-exag">
            {t("terrain.exag")} ×{exag}
            <input type="range" min={1} max={10} step={1} value={exag} aria-label={t("terrain.exag")} onChange={(e) => setExag(Number(e.target.value))} />
          </label>
        }
      >
        <div className="panel-sub">
          {t("terrain.sub", { site: selected?.site.name ?? "" })} · {t("polar.sun")} {fmtDeg(selected?.series.sunEl[idx] ?? 0)} · {t("polar.earth")} {fmtDeg(selected?.series.earthEl[idx] ?? 0)}
        </div>
        <p className="hint">{t("terrain.flat")}</p>
        <div className="terr-tools">
          {(["oblique", "top", "site"] as const).map((v) => (
            <button key={v} type="button" className="btn terr-btn" aria-pressed={view === v} onClick={() => go(v)}>
              {t(`terrain.view.${v}` as const)}
            </button>
          ))}
          <button type="button" className="btn terr-btn" aria-pressed={rings} onClick={() => setRings((g) => !g)}>
            {t("terrain.grid")}
          </button>
        </div>
        <div className="terr-box" role="img" aria-label={t("terrain.aria")}>
          <div className="terr-hud" aria-hidden="true">
            {selected && (
              <div className="terr-hud-site">
                <b>{selected.site.name}</b>
                <span>
                  {selected.site.lat.toFixed(2)}°, {selected.site.lon.toFixed(2)}°
                </span>
              </div>
            )}
            <div className="terr-hud-scale">{t("terrain.hud.scale", { km: stepKm, exag })}</div>
          </div>
          {/* ← aquí va el terreno 3D / 2D (vacío por ahora) */}
        </div>
        <div className="legend">
          <span><i className="dot sun" /> {t("polar.sun")} (●)</span>
          <span><i className="dot earth" /> {t("polar.earth")} (◉)</span>
        </div>
      </Panel>
      <DataBadge data={null} grid={grid} lhorSites={0} totalSites={analyses.length} />
    </div>
  );
}
