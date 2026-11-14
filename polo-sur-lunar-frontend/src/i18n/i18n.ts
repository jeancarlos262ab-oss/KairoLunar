import { useCallback } from "react";
import { en } from "./locales/en";
import { es } from "./locales/es";
import { useStore } from "../state/store";
import type { Lang } from "../state/store";

export type MsgKey = keyof typeof en;
const DICT: Readonly<Record<Lang, Readonly<Record<MsgKey, string>>>> = { en, es };

export function translate(lang: Lang, key: MsgKey, vars?: Readonly<Record<string, string | number>>): string {
  const raw = DICT[lang][key] ?? en[key];
  return vars ? raw.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : raw;
}

export type TFn = (key: MsgKey, vars?: Readonly<Record<string, string | number>>) => string;

export function useT(): TFn {
  const lang = useStore((s) => s.lang);
  return useCallback((key, vars) => translate(lang, key, vars), [lang]);
}
