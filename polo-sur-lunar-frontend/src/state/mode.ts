import { createContext, useContext } from "react";

export type Mode = "easy" | "expert";

export const ModeContext = createContext<Mode>("easy");

export const useEasy = (): boolean => useContext(ModeContext) === "easy";

const MODE_KEY = "lsp-mode";
const TOUR_KEY = "lsp-tour-seen";

/** El almacenamiento del navegador puede fallar (modo privado, bloqueado): siempre en try/catch. */
export function loadMode(): Mode {
  try {
    return window.localStorage.getItem(MODE_KEY) === "easy" ? "easy" : "expert";
  } catch {
    return "expert";
  }
}

export function saveMode(mode: Mode): void {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* sin almacenamiento: el modo solo dura la sesión */
  }
}

export function tourSeen(): boolean {
  try {
    return window.localStorage.getItem(TOUR_KEY) === "1";
  } catch {
    return false;
  }
}

export function markTourSeen(): void {
  try {
    window.localStorage.setItem(TOUR_KEY, "1");
  } catch {
    /* ignorar */
  }
}
