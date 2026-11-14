import { useEffect, useMemo, useRef, useState } from 'react'
import Home from './pages/Home'
import KeepAlive from './components/ui/KeepAlive'
import LangToggle from './components/ui/LangToggle'
import ModeToggle from './components/ui/ModeToggle'
import { BellIcon, GearIcon, HelpIcon, SearchIcon } from './components/ui/Icons'
import Screens from './Screens.jsx'
import TerrainView from './views/TerrainView'
import SitesView from './views/SitesView'
import DataBadge from './components/ui/DataBadge'
import { buildGrid, analyzeAll, bestWindows, sampleIndex, upcomingEvents, DAY_MS, HOUR_MS } from './engine'
import { clamp, eventTitle, fmtDateTime } from './lib/format'
import { useT } from './i18n/i18n'
import { ModeContext } from './state/mode'
import { useStore } from './state/store'
import { NAV_ITEMS } from './state/nav'

const PLAY_STEP_MS = 3 * HOUR_MS

/**
 * Cascarón de la app. INICIO (HOME) es el de `base` (misma barra superior, mismo globo y mismas tarjetas);
 * el resto de pantallas siguen siendo las de src y se irán migrando una a una.
 */
export default function App() {
  const {
    mode, view, startIso, spanDays, mask, priority, planDays, sites, enabled, selectedId, scrubMs, playing, lang,
    setMode, setView, setStartIso, setMask, setSelectedId, setScrubMs, setPlaying,
  } = useStore()
  const t = useT()
  const [bellOpen, setBellOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [legacySite, setLegacySite] = useState(0)
  const askRef = useRef(null)

  const startMs = useMemo(() => Date.parse(`${startIso}T00:00:00Z`), [startIso])
  const endMs = startMs + spanDays * DAY_MS

  useEffect(() => {
    setScrubMs(startMs + 12 * HOUR_MS)
  }, [startMs, spanDays])

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = t('app.title')
  }, [lang, t])

  // Motor de datos simulado (ver engine/index.js)
  const grid = useMemo(() => buildGrid(startMs, spanDays), [startMs, spanDays])
  const analyses = useMemo(
    () => analyzeAll(grid, sites, mask, priority).filter((a) => enabled.has(a.site.id)),
    [grid, sites, mask, priority, enabled],
  )
  const plans = useMemo(() => bestWindows(analyses, grid, planDays, priority), [analyses, grid, planDays, priority])

  const selected = analyses.find((a) => a.site.id === selectedId) ?? analyses[0]
  const timeMs = clamp(scrubMs, startMs, endMs)
  const idx = sampleIndex(grid, timeMs)

  useEffect(() => {
    if (!playing) return undefined
    const id = window.setInterval(() => {
      setScrubMs((v) => (v + PLAY_STEP_MS > endMs ? startMs : v + PLAY_STEP_MS))
    }, 90)
    return () => window.clearInterval(id)
  }, [playing, startMs, endMs])

  const soon = useMemo(() => (selected ? upcomingEvents(selected, grid, idx, 6).filter((e) => e.inHours <= 72) : []), [selected, grid, idx])

  const jumpToPlan = (r) => {
    setSelectedId(r.site.id)
    setScrubMs(r.startMs + 12 * HOUR_MS)
  }

  const ask = (raw) => {
    const q = raw.trim()
    if (q === '') return ''
    if (/^\d{4}-\d{2}-\d{2}$/.test(q)) {
      const ms = Date.parse(`${q}T12:00:00Z`)
      if (Number.isNaN(ms)) return t('ask.badDate', { q })
      if (ms >= startMs && ms <= endMs) setScrubMs(ms)
      else setStartIso(q)
      return t('ask.jumped', { q })
    }
    if (/^(best|top|mejor)/i.test(q)) {
      const top = plans[0]
      if (top) {
        jumpToPlan(top)
        return t('ask.best', { site: top.site.name })
      }
      const best = [...analyses].sort((a, b) => b.score - a.score)[0]
      if (best) {
        setSelectedId(best.site.id)
        return t('ask.bestSite', { site: best.site.name })
      }
    }
    const hit = analyses.find((a) => a.site.name.toLowerCase().includes(q.toLowerCase()))
    if (hit) {
      setSelectedId(hit.site.id)
      return t('ask.showing', { site: hit.site.name })
    }
    return t('ask.none', { q })
  }

  const focusAsk = () => {
    setBellOpen(false)
    setSettingsOpen(false)
    setView('HOME')
    window.setTimeout(() => askRef.current?.focus(), 30)
  }

  // Puente con las pantallas que aún son las de src (usan "día" 0–30 y el modo 'exp')
  const day = (timeMs - startMs) / DAY_MS
  const setDay = (d) => setScrubMs(startMs + d * DAY_MS)

  const visited = useRef(new Set())
  visited.current.add(view)

  return (
    <ModeContext.Provider value={mode}>
      <div className={`app${view === 'HOME' ? '' : view === 'TERRAIN' || view === 'SITES' ? ' detail' : ' detail legacy'}`}>
        <header className="topbar">
          <div className="logo">
            LUNAR<small>{t('app.sub')}</small>
          </div>

          <nav className="nav" aria-label={t('nav.aria')}>
            {NAV_ITEMS.map((item) => (
              <button key={item} type="button" aria-current={view === item ? 'page' : undefined} onClick={() => setView(item)}>
                {t(`nav.${item}`)}
              </button>
            ))}
          </nav>

          <div className="top-actions">
            <LangToggle />
            <ModeToggle mode={mode} onChange={setMode} />
            <button className="icon-btn" type="button" aria-label={t('top.tour')}>
              <HelpIcon />
            </button>
            <button className="icon-btn" type="button" aria-label={t('top.search')} onClick={focusAsk}>
              <SearchIcon />
            </button>
            <button
              className="icon-btn"
              type="button"
              aria-label={t('top.events')}
              aria-expanded={bellOpen}
              onClick={() => {
                setBellOpen((v) => !v)
                setSettingsOpen(false)
              }}
            >
              <BellIcon />
              {soon.length > 0 && <span className="badge">{soon.length}</span>}
            </button>
            <button
              className="icon-btn"
              type="button"
              aria-label={t('top.settings')}
              aria-expanded={settingsOpen}
              onClick={() => {
                setSettingsOpen((v) => !v)
                setBellOpen(false)
              }}
            >
              <GearIcon />
            </button>
          </div>
        </header>

        {selected && (
          <KeepAlive name="HOME" active={view === 'HOME'}>
            <Home
              analyses={analyses}
              selected={selected}
              grid={grid}
              idx={idx}
              timeMs={timeMs}
              mask={mask}
              playing={playing}
              plan={plans[0] ?? null}
              askRef={askRef}
              onSelect={setSelectedId}
              onPlan={jumpToPlan}
              onGo={setView}
              onScrub={setScrubMs}
              onTogglePlay={() => setPlaying((v) => !v)}
              onAsk={ask}
            />
          </KeepAlive>
        )}

        {view === 'TERRAIN' && selected && <TerrainView analyses={analyses} selectedId={selected.site.id} grid={grid} idx={idx} />}

        {view === 'SITES' && selected && (
          <SitesView
            analyses={analyses}
            selected={selected}
            grid={grid}
            timeMs={timeMs}
            mask={mask}
            spanDays={spanDays}
            startIso={startIso}
            badge={<DataBadge data={null} grid={grid} lhorSites={0} totalSites={analyses.length} />}
            onSelect={setSelectedId}
          />
        )}

        {view !== 'HOME' && view !== 'TERRAIN' && view !== 'SITES' && (
          <Screens
            screen={NAV_ITEMS.indexOf(view)}
            lang={lang}
            site={legacySite}
            setSite={setLegacySite}
            go={(i) => setView(NAV_ITEMS[i])}
            mode={mode === 'expert' ? 'exp' : 'easy'}
            day={day}
            setDay={setDay}
            playing={playing}
            setPlaying={setPlaying}
          />
        )}

        {bellOpen && (
          <div className="popover bell">
            <div className="panel-title">{t('bell.title', { site: selected?.site.name ?? '' })}</div>
            {soon.length === 0 ? (
              <p className="hint">{t('bell.none')}</p>
            ) : (
              <ul>
                {soon.map((e) => (
                  <li key={`${e.kind}-${e.ms}`}>
                    <b>{eventTitle(e.title, t)}</b>
                    <span>{fmtDateTime(e.ms)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </ModeContext.Provider>
  )
}
