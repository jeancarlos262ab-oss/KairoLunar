import { create } from "zustand";
import { loadMode, markTourSeen, saveMode, tourSeen } from "./mode";
import type { Mode } from "./mode";
import type { NavItem } from "./nav";
import { DEFAULT_SITES } from "../engine/index";
import type { Site } from "../engine/index";

export type Lang = "en" | "es";
type Upd<T> = T | ((prev: T) => T);
const apply = <T,>(u: Upd<T>, prev: T): T => (typeof u === "function" ? (u as (p: T) => T)(prev) : u);

const LANG_KEY = "lsp-lang";
function loadLang(): Lang {
  // src arranca en español (como antes); base elegía por idioma del navegador
  const FALLBACK: Lang = "es";
  try {
    const v = window.localStorage.getItem(LANG_KEY);
    if (v === "en" || v === "es") return v;
  } catch {
    /* sin almacenamiento */
  }
  return FALLBACK;
}

/** Fecha fija mientras el motor sea simulado (así los datos de ejemplo siempre coinciden). */
const todayIso = (): string => "2026-11-14";

export interface AppState {
  readonly mode: Mode;
  readonly lang: Lang;
  readonly tourOpen: boolean;
  readonly view: NavItem;
  readonly startIso: string;
  readonly spanDays: number;
  /** Margen global de horizonte (°); con máscara real (LHOR) se suma al terreno. */
  readonly mask: number;
  readonly priority: number;
  readonly planDays: number;
  readonly sites: readonly Site[];
  readonly enabled: ReadonlySet<string>;
  readonly selectedId: string;
  readonly scrubMs: number;
  readonly playing: boolean;
  setMode(m: Mode): void;
  setLang(l: Lang): void;
  setTourOpen(open: boolean): void;
  setView(v: NavItem): void;
  setStartIso(u: Upd<string>): void;
  setSpanDays(u: Upd<number>): void;
  setMask(u: Upd<number>): void;
  setPriority(u: Upd<number>): void;
  setPlanDays(u: Upd<number>): void;
  setSites(u: Upd<readonly Site[]>): void;
  setEnabled(u: Upd<ReadonlySet<string>>): void;
  setSelectedId(u: Upd<string>): void;
  setScrubMs(u: Upd<number>): void;
  setPlaying(u: Upd<boolean>): void;
}

export const useStore = create<AppState>((set) => ({
  mode: loadMode(),
  lang: loadLang(),
  tourOpen: false,
  view: "HOME",
  startIso: todayIso(),
  spanDays: 30,
  mask: 0,
  priority: 0.5,
  planDays: 7,
  sites: DEFAULT_SITES,
  enabled: new Set(DEFAULT_SITES.map((s) => s.id)),
  selectedId: DEFAULT_SITES[0]?.id ?? "",
  scrubMs: Date.parse(`${todayIso()}T12:00:00Z`),
  playing: false,
  setMode: (mode) => {
    saveMode(mode);
    set({ mode });
  },
  setLang: (lang) => {
    try {
      window.localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* ignorar */
    }
    set({ lang });
  },
  setTourOpen: (tourOpen) => {
    if (!tourOpen) markTourSeen();
    set({ tourOpen });
  },
  setView: (view) => set({ view }),
  setStartIso: (u) => set((s) => ({ startIso: apply(u, s.startIso) })),
  setSpanDays: (u) => set((s) => ({ spanDays: apply(u, s.spanDays) })),
  setMask: (u) => set((s) => ({ mask: apply(u, s.mask) })),
  setPriority: (u) => set((s) => ({ priority: apply(u, s.priority) })),
  setPlanDays: (u) => set((s) => ({ planDays: apply(u, s.planDays) })),
  setSites: (u) => set((s) => ({ sites: apply(u, s.sites) })),
  setEnabled: (u) => set((s) => ({ enabled: apply(u, s.enabled) })),
  setSelectedId: (u) => set((s) => ({ selectedId: apply(u, s.selectedId) })),
  setScrubMs: (u) => set((s) => ({ scrubMs: apply(u, s.scrubMs) })),
  setPlaying: (u) => set((s) => ({ playing: apply(u, s.playing) })),
}));
