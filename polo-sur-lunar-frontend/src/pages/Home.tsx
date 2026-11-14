import { Fragment, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactElement, RefObject } from "react";
import InsightArt from "../components/charts/InsightArt";
import MoonHero from "../components/globe/MoonHero";
import SkyRadar from "../components/charts/SkyRadar";
import Stars from "../components/ui/Stars";
import { ArrowUpRight, CloseIcon, GridIcon, HelpIcon, MaximizeIcon, MinimizeIcon, SparkIcon } from "../components/ui/Icons";
import { siteEvents, upcomingEvents } from "../engine/index";
import type { PlanResult, SiteAnalysis, TimeGrid } from "../engine/index";
import { eventTitle, fmtClock, fmtDateTime, fmtDay, fmtDeg, fmtHours, fmtIn, fmtPct, shortName } from "../lib/format";
import { useT } from "../i18n/i18n";
import { useMemoryState } from "../hooks/useMemoryState";
import { useEasy } from "../state/mode";
import { useViewActive } from "../state/viewActive";
import type { NavItem } from "../state/nav";
import { verdictFor } from "../lib/verdict";

interface Props {
  readonly analyses: readonly SiteAnalysis[];
  readonly selected: SiteAnalysis;
  readonly grid: TimeGrid;
  readonly idx: number;
  readonly timeMs: number;
  readonly mask: number;
  readonly playing: boolean;
  readonly plan: PlanResult | null;
  readonly askRef: RefObject<HTMLInputElement>;
  readonly onSelect: (id: string) => void;
  readonly onPlan: (p: PlanResult) => void;
  readonly onGo: (view: NavItem) => void;
  readonly onScrub: (ms: number) => void;
  readonly onTogglePlay: () => void;
  readonly onAsk: (query: string) => string;
}

export default function Home(p: Props): ReactElement {
  const { analyses, selected, grid, idx, timeMs, mask, plan } = p;
  const easy = useEasy();
  const t = useT();
  /** "Sun|elevation" → dos líneas. */
  const lines = (s: string): ReactElement => (
    <>
      {s.split("|").map((part, i) => (
        <Fragment key={part}>
          {i > 0 && <br />}
          {part}
        </Fragment>
      ))}
    </>
  );
  // Estos tres valores sobreviven al cambio de pestaña (singleton viewMemory).
  const [infoOpen, setInfoOpen] = useMemoryState<boolean>("home:infoOpen", true);
  const [query, setQuery] = useMemoryState<string>("home:query", "");
  const [reply, setReply] = useMemoryState<string>("home:reply", "");

  // Reabre la tarjeta solo cuando cambia el sitio mientras la pantalla está abierta, no al volver a montarla.
  const lastSite = useRef<string>(selected.site.id);
  useEffect(() => {
    if (lastSite.current === selected.site.id) return;
    lastSite.current = selected.site.id;
    setInfoOpen(true);
  }, [selected.site.id, setInfoOpen]);

  // Vista despejada del globo: oculta paneles (CSS con html[data-focus]) y, si el navegador lo permite, usa pantalla completa real.
  const [focus, setFocus] = useState<boolean>(false);
  const toggleFocus = (): void => {
    const next = !focus;
    setFocus(next);
    try {
      if (next && !document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => undefined);
      if (!next && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    } catch {
      /* sin API de pantalla completa: queda la vista despejada */
    }
  };
  // Home sigue montada al cambiar de pestaña: al ocultarse sale de la vista despejada / pantalla completa.
  const active = useViewActive();
  useEffect(() => {
    if (active || !focus) return;
    setFocus(false);
    try {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    } catch {
      /* sin API de pantalla completa */
    }
  }, [active, focus]);
  useEffect(() => {
    if (focus) document.documentElement.dataset.focus = "1";
    else delete document.documentElement.dataset.focus;
    return () => {
      delete document.documentElement.dataset.focus;
    };
  }, [focus]);
  useEffect(() => {
    if (!focus) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setFocus(false);
    };
    const onFs = (): void => {
      if (!document.fullscreenElement) setFocus(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [focus]);

  const m = selected.metrics;
  const verdict = verdictFor(m, t);
  const ev = siteEvents(selected, grid, idx);
  const events = upcomingEvents(selected, grid, idx, 3);
  const ranked = [...analyses].sort((a, b) => b.score - a.score);
  const best = ranked[0] ?? selected;
  const bars = ranked.slice(0, 6);
  const spanH = grid.spanDays * 24;
  const frame = grid.frames[idx];

  const sunEl = selected.series.sunEl[idx] ?? -90;
  const earthEl = selected.series.earthEl[idx] ?? -90;
  const sunUp = (selected.vis.sunUp[idx] ?? 0) === 1;
  const earthUp = (selected.vis.earthUp[idx] ?? 0) === 1;

  const statusExpert = sunUp && earthUp ? t("home.statusPC") : sunUp ? t("home.statusSun") : earthUp ? t("home.statusDarkEarth") : t("home.statusDark");
  const statusEasy =
    sunUp && earthUp ? t("home.easyPC") : sunUp ? t("home.easySun") : earthUp ? t("home.easyEarth") : t("home.easyDark");

  const sunEvt = ev.sun ? t(ev.sun.toOn ? "home.sunrise" : "home.sunset", { t: fmtHours(ev.sun.inHours) }) : sunUp ? t("home.sunAll") : t("home.sunNone");
  const sunEvtEasy = ev.sun
    ? t(ev.sun.toOn ? "home.sunRisesEasy" : "home.sunSetsEasy", { t: fmtIn(ev.sun.inHours, t), d: fmtDay(ev.sun.ms) })
    : sunUp
      ? t("home.sunAllEasy")
      : t("home.sunNoneEasy");
  const darkExpert = ev.longestDark ? t("home.darkExpert", { h: fmtHours(ev.longestDark.hours), d: fmtDay(ev.longestDark.startMs) }) : t("home.darkNever");
  const darkEasy = ev.longestDark ? t("home.darkEasy", { t: fmtIn(ev.longestDark.hours, t), d: fmtDay(ev.longestDark.startMs) }) : t("home.darkNoneEasy");
  const recNote = plan ? t("home.recPlan", { d: fmtDay(plan.startMs), n: Math.round(plan.score) }) : t("home.recBest", { n: Math.round(best.score) });
  const recNoteEasy = plan ? t("home.recPlanEasy", { d: fmtDay(plan.startMs), n: Math.round(plan.score) }) : t("home.recBestEasy", { n: Math.round(best.score) });
  const recSite = plan ? plan.site : best.site;

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    setReply(p.onAsk(query));
    setQuery("");
  };

  const rows: ReadonlyArray<{ readonly label: string; readonly frac: number; readonly text: string }> = [
    { label: easy ? t("home.rowPowerE") : t("home.rowPowerX"), frac: m.sunPct, text: fmtPct(m.sunPct) },
    { label: easy ? t("home.rowEarthE") : t("home.rowEarthX"), frac: m.earthPct, text: fmtPct(m.earthPct) },
    { label: t("home.rowBoth"), frac: m.bothPct, text: fmtPct(m.bothPct) },
    { label: easy ? t("rk.night") : t("rk.dark"), frac: m.longestDarkH / spanH, text: fmtHours(m.longestDarkH) },
    { label: easy ? t("home.rowSilenceE") : t("home.rowSilenceX"), frac: m.longestBlackoutH / spanH, text: fmtHours(m.longestBlackoutH) },
    { label: easy ? t("home.rowOverallE") : t("ui.score"), frac: selected.score / 100, text: String(Math.round(selected.score)) },
  ];

  return (
    <>
      {focus && (
        <button type="button" className="focus-exit" aria-label={t("home.exitFs")} title={t("home.exitTitle")} onClick={toggleFocus}>
          <MinimizeIcon /> <span>{t("home.exit")}</span>
        </button>
      )}
      <div className="globe-layer">
        <MoonHero analyses={analyses} selectedId={selected.site.id} frame={frame} idx={idx} mask={mask} onSelect={p.onSelect} centered={focus} />
      </div>

      {/* Izquierda: veredicto + explorar + línea de tiempo + pregunta */}
      <section className="main-left">
        {easy && (
          <div className="verdict" aria-live="polite">
            <div className="verdict-top">
              <b>{shortName(selected.site.name)}</b>
              <span className="v-row">
                {t("home.power")} <Stars value={verdict.power} label={t("home.power")} />
              </span>
              <span className="v-row">
                {t("home.contact")} <Stars value={verdict.comms} label={t("sm.comms")} />
              </span>
            </div>
            <p>{verdict.headline}</p>
          </div>
        )}

        <button className="explore" type="button" onClick={() => p.onGo("SKY")}>
          {t("home.explore")}
        </button>

        <div className="scrubber">
          <button type="button" className="mini" aria-label={p.playing ? t("ui.pause") : t("ui.play")} onClick={p.onTogglePlay}>
            {p.playing ? "❚❚" : "▶"}
          </button>
          <div className="scrub-body">
            <div className="scrub-label">
              {fmtDateTime(timeMs)}
              {easy ? t("home.drag") : ""}
            </div>
            <input
              type="range"
              aria-label={t("home.dateTime")}
              min={grid.startMs}
              max={grid.startMs + grid.spanDays * 86_400_000}
              step={1_800_000}
              value={timeMs}
              onChange={(e) => p.onScrub(Number(e.target.value))}
            />
          </div>
        </div>

        <form className="ask" onSubmit={submit}>
          <span className="spark">
            <SparkIcon width={16} height={16} />
          </span>
          <input
            ref={p.askRef}
            type="text"
            value={query}
            placeholder={reply !== "" ? reply : easy ? t("home.phEasy") : t("home.phExpert")}
            aria-label={t("home.askAria")}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="mini" aria-label={t("ui.help")} onClick={() => setReply(t("home.askHelp"))}>
            <HelpIcon />
          </button>
          <button type="button" className="mini" aria-label={t("home.openSky")} onClick={() => p.onGo("SKY")}>
            <GridIcon />
          </button>
          <button type="button" className="mini" aria-label={t("home.fsView")} title={t("home.fsTitle")} onClick={toggleFocus}>
            <MaximizeIcon />
          </button>
        </form>
      </section>

      {/* Columna derecha: todos los contenedores */}
      <div className="side">
      {/* Centro: tarjeta del sitio + radar */}
      <section className="main-mid">
        {infoOpen && (
          <article className="panel info">
            <button className="corner-btn" type="button" aria-label={t("ui.close")} onClick={() => setInfoOpen(false)}>
              <CloseIcon />
            </button>
            <h3>
              {easy ? t("home.nowAt") : t("home.site")}
              <span>{shortName(selected.site.name).toUpperCase()}</span>
            </h3>
            {easy ? (
              <div className="stats">
                <div className="stat">
                  <small>{t("polar.sun")}</small>
                  <b className={sunUp ? "ok" : "bad"}>{sunUp ? t("home.visible") : t("home.hidden")}</b>
                </div>
                <div className="stat">
                  <small>{t("polar.earth")}</small>
                  <b className={earthUp ? "ok" : "bad"}>{earthUp ? t("home.visible") : t("home.hidden")}</b>
                </div>
                <div className="stat">
                  <small>{t("home.sunChanges")}</small>
                  <b>{ev.sun ? fmtIn(ev.sun.inHours, t) : "—"}</b>
                </div>
                <div className="stat">
                  <small>{t("home.earthChanges")}</small>
                  <b>{ev.earth ? fmtIn(ev.earth.inHours, t) : "—"}</b>
                </div>
                <div className="stat wide">
                  <small>{t("home.whatMeans")}</small>
                  <span className="purpose">{statusEasy}</span>
                </div>
              </div>
            ) : (
              <div className="stats">
                <div className="stat">
                  <small>{lines(t("home.sunEl"))}</small>
                  <b>{fmtDeg(sunEl)}</b>
                </div>
                <div className="stat">
                  <small>{lines(t("home.earthEl"))}</small>
                  <b>{fmtDeg(earthEl)}</b>
                </div>
                <div className="stat">
                  <small>{lines(`${t("home.next")}|${ev.sun ? (ev.sun.toOn ? t("home.sunriseW") : t("home.sunsetW")) : t("home.sunEvent")}`)}</small>
                  <b>{ev.sun ? fmtHours(ev.sun.inHours) : "—"}</b>
                </div>
                <div className="stat">
                  <small>{lines(`${t("home.next")}|${ev.earth ? (ev.earth.toOn ? t("home.earthriseW") : t("home.earthsetW")) : t("home.earthEvent")}`)}</small>
                  <b>{ev.earth ? fmtHours(ev.earth.inHours) : "—"}</b>
                </div>
                <div className="stat wide">
                  <small>{t("home.status")}</small>
                  <span className="purpose">{statusExpert}</span>
                </div>
              </div>
            )}
            <span className="plus" aria-hidden="true">
              +
            </span>
          </article>
        )}

        <article className="panel radar-card">
          <SkyRadar sunAz={selected.series.sunAz[idx] ?? 0} sunEl={sunEl} earthAz={selected.series.earthAz[idx] ?? 0} earthEl={earthEl} mask={mask} />
          {easy && (
            <div className="radar-cap">
              <span>
                <i className="dot sun" />
                {t("polar.sun")}
              </span>
              <span>
                <i className="dot earth" />
                {t("polar.earth")}
              </span>
              <span className="muted">{t("home.radarCap")}</span>
            </div>
          )}
        </article>
      </section>

      {/* Derecha: Insights */}
      <aside className="panel main-right" aria-label={t("home.insightsAria")}>
        <div className="insights-head">
          <SparkIcon />
          <span>{easy ? t("home.highlights") : t("home.insights")}</span>
        </div>

        <div className="section-label">{easy ? t("home.comingUp") : t("home.predictions")}</div>
        <article className="sat-card">
          <InsightArt variant="sun" />
          <button className="corner-btn" type="button" aria-label={t("home.openSky")} onClick={() => p.onGo("SKY")}>
            <ArrowUpRight />
          </button>
          <small>{easy ? (sunUp ? t("home.sunUp") : t("home.sunDown")) : sunUp ? t("home.sunAbove") : t("home.sunBelow")}</small>
          <div className="name">{shortName(selected.site.name)}</div>
          <div className="note">
            <i>{ev.sun && !ev.sun.toOn ? "!" : "◎"}</i>
            <span>{easy ? sunEvtEasy : sunEvt}</span>
          </div>
        </article>

        <div className="section-label">{easy ? t("home.watchOut") : t("home.aboutDark")}</div>
        <article className="sat-card">
          <InsightArt variant="night" />
          <button className="corner-btn" type="button" aria-label={t("home.openTimeline")} onClick={() => p.onGo("SKY")}>
            <ArrowUpRight />
          </button>
          <small>{t("home.longestNight")}</small>
          <div className="name">{shortName(selected.site.name)}</div>
          <div className="note">
            <i>!</i>
            <span>{easy ? darkEasy : darkExpert}</span>
          </div>
        </article>

        <div className="section-label">{easy ? t("home.ourPick") : t("home.recs")}</div>
        <article className="sat-card">
          <InsightArt variant="earth" />
          <button className="corner-btn" type="button" aria-label={t("home.open", { site: recSite.name })} onClick={() => (plan ? p.onPlan(plan) : p.onSelect(best.site.id))}>
            <ArrowUpRight />
          </button>
          <small>{easy ? t("home.bestMatch") : t("home.bestSiteStart")}</small>
          <div className="name">{shortName(recSite.name)}</div>
          <div className="note">
            <i className="orbit">◎</i>
            <span>{easy ? recNoteEasy : recNote}</span>
          </div>
        </article>
      </aside>

      {/* Fila inferior */}
      <section className="bottom">
        <article className="panel card">
          <div className="panel-title">{easy ? t("home.bestPlaces") : t("home.sitesByScore")}</div>
          <div className="big-number">
            {analyses.length}
            <small>{easy ? t("home.placesCompared") : t("home.sites")}</small>
          </div>
          <div className="bars" style={{ gridTemplateColumns: `34px repeat(${bars.length}, 1fr)` }}>
            <div className="y-axis">
              <span>100</span>
              <span>50</span>
              <span>0</span>
            </div>
            {bars.map((a) => (
              <button key={a.site.id} type="button" className="bar-col" aria-label={t("cmp.row", { site: a.site.name, n: Math.round(a.score) })} onClick={() => p.onSelect(a.site.id)}>
                <div className={`bar${a.site.id === selected.site.id ? " active" : ""}`} style={{ height: `${Math.max(3, a.score)}%` }} />
              </button>
            ))}
            <span />
            {bars.map((a) => (
              <div className="x-label" key={`x-${a.site.id}`}>
                {shortName(a.site.name)}
              </div>
            ))}
          </div>
          <button className="corner-btn" type="button" aria-label={t("home.openRanking")} onClick={() => p.onGo("SITES")}>
            <ArrowUpRight />
          </button>
        </article>

        <article className="panel card">
          <div className="panel-title">{easy ? t("home.whatNext") : t("home.upcoming")}</div>
          {events.length === 0 ? (
            <p className="hint">{t("home.noEvents")}</p>
          ) : (
            <div className="releases-table">
              {events.map((e) => (
                <div className="release" key={`${e.kind}-${e.ms}`}>
                  <span className="date">{fmtDay(e.ms)}</span>
                  <div className="mission">{eventTitle(e.title, t)}</div>
                  <div className="payload">{easy ? t("home.inT", { t: fmtIn(e.inHours, t) }) : fmtClock(e.ms)}</div>
                  <span className="site">• {e.kind === "sun" ? t("home.power") : easy ? t("su.radio") : t("su.comms")}</span>
                </div>
              ))}
            </div>
          )}
          <button className="corner-btn" type="button" aria-label={t("home.openCalendar")} onClick={() => p.onGo("CALENDAR")}>
            <ArrowUpRight />
          </button>
        </article>

        <article className="panel card">
          <div className="panel-title">
            {easy ? t("home.howGood", { site: shortName(selected.site.name) }) : t("home.powerComms", { site: shortName(selected.site.name) })}
          </div>
          <div className="purpose-list">
            {rows.map((r) => (
              <div className="purpose-row" key={r.label}>
                <span>{r.label}</span>
                <div className="track">
                  <div className="fill" style={{ width: `${Math.max(0, Math.min(1, r.frac)) * 100}%` }} />
                </div>
                <span className="val">{r.text}</span>
              </div>
            ))}
          </div>
          <button className="corner-btn" type="button" aria-label={t("home.openDetails")} onClick={() => p.onGo("SITES")}>
            <ArrowUpRight />
          </button>
        </article>
      </section>
      </div>
    </>
  );
}
