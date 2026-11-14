import type { SiteMetrics } from "../engine/index";
import type { TFn } from "../i18n/i18n";
import { fmtHours, fmtIn, fmtPct } from "./format";

export interface Verdict {
  /** 1–5 estrellas. */
  readonly power: number;
  readonly comms: number;
  readonly resilience: number;
  readonly powerText: string;
  readonly commsText: string;
  readonly darkText: string;
  readonly headline: string;
}

type Cuts = readonly [number, number, number, number];

const stars = (x: number, c: Cuts): number => (x >= c[3] ? 5 : x >= c[2] ? 4 : x >= c[1] ? 3 : x >= c[0] ? 2 : 1);

export function verdictFor(m: SiteMetrics, t: TFn): Verdict {
  const power = stars(m.sunPct, [0.35, 0.55, 0.75, 0.9]);
  const comms = stars(m.earthPct, [0.2, 0.4, 0.6, 0.8]);
  const darkDays = m.longestDarkH / 24;
  const resilience = darkDays <= 0.5 ? 5 : darkDays <= 2 ? 4 : darkDays <= 5 ? 3 : darkDays <= 10 ? 2 : 1;

  const sun = fmtPct(m.sunPct);
  const earth = fmtPct(m.earthPct);
  const powerText =
    m.sunPct >= 0.995 ? t("v.power.never") : m.sunPct >= 0.8 ? t("v.power.high", { pct: sun }) : m.sunPct >= 0.5 ? t("v.power.mid", { pct: sun }) : t("v.power.low", { pct: sun });

  const silence = m.longestBlackoutH > 0 ? t("v.silence", { h: fmtHours(m.longestBlackoutH) }) : "";
  const commsText =
    m.earthPct >= 0.995
      ? t("v.comms.always")
      : m.earthPct >= 0.8
        ? t("v.comms.most", { pct: earth, silence })
        : m.earthPct >= 0.4
          ? t("v.comms.some", { pct: earth, silence })
          : t("v.comms.low", { pct: earth, silence });

  const darkText = m.longestDarkH < 1 ? t("v.dark.none") : t("v.dark.some", { t: fmtIn(m.longestDarkH, t) });

  const headline =
    power >= 4 && comms >= 4
      ? t("v.head.excellent")
      : power >= 4
        ? t("v.head.power")
        : comms >= 4
          ? t("v.head.comms")
          : power >= 3 && comms >= 3
            ? t("v.head.balanced")
            : t("v.head.tough");

  return { power, comms, resilience, powerText, commsText, darkText, headline };
}
