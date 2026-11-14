import { useStore } from "../state/store";
import type { Lang } from "../state/store";
import type { TFn } from "../i18n/i18n";

/** Idioma activo para los formateadores que no son componentes (los componentes se suscriben con useT/useStore). */
export const curLang = (): Lang => useStore.getState().lang;
const LOCALE: Readonly<Record<Lang, string>> = { en: "en-US", es: "es-MX" };

const dayFmts = new Map<Lang, Intl.DateTimeFormat>();
const dateTimeFmts = new Map<Lang, Intl.DateTimeFormat>();
const clockFmts = new Map<Lang, Intl.DateTimeFormat>();

function cached(map: Map<Lang, Intl.DateTimeFormat>, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const lang = curLang();
  let f = map.get(lang);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE[lang], { ...opts, timeZone: "UTC" });
    map.set(lang, f);
  }
  return f;
}

export const fmtDay = (ms: number): string => cached(dayFmts, { month: "short", day: "numeric" }).format(ms);
export const fmtDateTime = (ms: number): string =>
  `${cached(dateTimeFmts, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(ms)} UTC`;
/** Solo la hora: "19:00 UTC". */
export const fmtClock = (ms: number): string => `${cached(clockFmts, { hour: "2-digit", minute: "2-digit", hour12: false }).format(ms)} UTC`;
/** Número con separador de miles según el idioma. */
export const fmtNum = (n: number): string => Math.round(n).toLocaleString(LOCALE[curLang()]);

export const fmtPct = (x: number): string => `${Math.round(x * 100)}%`;
export const fmtDeg = (x: number, digits = 1): string => `${x.toFixed(digits)}°`;

export function fmtHours(h: number): string {
  if (h <= 0) return "0 h";
  if (h >= 48) return `${(h / 24).toFixed(1)} d`;
  return `${h < 10 ? h.toFixed(1) : Math.round(h)} h`;
}

export const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/** "Shackleton Connecting Ridge" → "Shackleton", "South Pole (90°S)" → "South Pole". */
export function shortName(name: string): string {
  const clean = name.replace(/\(.*?\)/g, "").trim();
  const words = clean.split(/\s+/);
  const first = words[0] ?? clean;
  if (first.length <= 5 && words.length > 1) return `${first} ${words[1] ?? ""}`.trim();
  return first.length > 11 ? `${first.slice(0, 10)}…` : first;
}

/** Duración en lenguaje llano: "less than an hour", "9 hours", "12 days" (o su equivalente en el idioma activo). */
export function fmtIn(hours: number, t: TFn): string {
  if (hours < 1) return t("fmt.lessHour");
  if (hours < 48) {
    const h = Math.round(hours);
    return t(h === 1 ? "fmt.hour" : "fmt.hours", { n: h });
  }
  return t("fmt.days", { n: Math.round(hours / 24) });
}

/** Hemisferios: en español el oeste es "O". */
export const latLabel = (v: number, digits = 2): string => `${Math.abs(v).toFixed(digits)}°${v < 0 ? "S" : "N"}`;
export const lonLabel = (v: number, digits = 2): string => `${Math.abs(v).toFixed(digits)}°${v < 0 ? (curLang() === "es" ? "O" : "W") : "E"}`;

const CARD_EN: Readonly<Record<number, string>> = { 0: "N", 45: "NE", 90: "E", 135: "SE", 180: "S", 225: "SW", 270: "W", 315: "NW", 360: "N" };
const CARD_ES: Readonly<Record<number, string>> = { 0: "N", 45: "NE", 90: "E", 135: "SE", 180: "S", 225: "SO", 270: "O", 315: "NO", 360: "N" };
/** Punto cardinal para un acimut múltiplo de 45°. */
export const cardinal = (az: number): string => (curLang() === "es" ? CARD_ES : CARD_EN)[az] ?? "";

/** Traduce el título de un evento del motor ("Sunrise", "Earthset"…); si no lo reconoce lo deja tal cual. */
export function eventTitle(title: string, t: TFn): string {
  return title.replace(/\b(Sunrise|Sunset|Earthrise|Earthset)\b/gi, (m) => t(`ev.${m.toLowerCase() as "sunrise" | "sunset" | "earthrise" | "earthset"}`));
}
