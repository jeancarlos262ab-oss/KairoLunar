import { useLayoutEffect } from "react";
import { viewMemory } from "../state/viewMemory";

/** Contenedores con scroll propio (escritorio) o con scroll horizontal interno (gráficas anchas). */
const SELECTOR = ".detail-body, .side, .chart-scroll";
/** Intentos (≈1.5 s) para esperar a que el contenido (gráficas, three.js lazy) tenga altura suficiente. */
const MAX_FRAMES = 90;

/** Con varias vistas montadas a la vez, solo cuentan los contenedores de la vista indicada. */
const containersOf = (view: string): HTMLElement[] => {
  const slot = document.querySelector<HTMLElement>(`[data-view-slot="${view}"]`);
  return Array.from((slot ?? document).querySelectorAll<HTMLElement>(SELECTOR));
};

/**
 * Recuerda el scroll de cada vista (página completa en móvil, contenedores internos en escritorio)
 * en el singleton `viewMemory` y lo restaura al volver a ella. Una vista que nunca se visitó arranca arriba.
 * Hace falta aunque las vistas sigan montadas: el navegador pierde el scroll interno de lo que pasa por display:none.
 */
export function useScrollMemory(view: string): void {
  useLayoutEffect(() => {
    let restoring = true;
    let raf = 0;
    let frames = 0;

    const stop = (): void => {
      restoring = false;
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
    };

    /** Devuelve true cuando todo quedó en su sitio. */
    const restore = (): boolean => {
      let done = true;
      const page = viewMemory.getScroll(`${view}:page`) ?? { left: 0, top: 0 };
      window.scrollTo(page.left, page.top);
      if (Math.abs(window.scrollY - page.top) > 1) done = false;

      containersOf(view).forEach((el, i) => {
        const pos = viewMemory.getScroll(`${view}:${i}`);
        if (!pos) return;
        el.scrollTop = pos.top;
        el.scrollLeft = pos.left;
        if (Math.abs(el.scrollTop - pos.top) > 1) done = false;
      });
      return done;
    };

    const tick = (): void => {
      raf = 0;
      if (!restoring) return;
      frames += 1;
      if (restore() || frames >= MAX_FRAMES) {
        stop();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    // Primer intento síncrono (antes de pintar) y reintentos si el contenido aún no tiene altura.
    if (restore()) restoring = false;
    else raf = requestAnimationFrame(tick);

    // Mientras se restaura se ignoran los eventos de scroll (los provoca la propia restauración).
    const onScroll = (e: Event): void => {
      if (restoring) return;
      const t = e.target;
      if (t === document) {
        viewMemory.setScroll(`${view}:page`, { left: window.scrollX, top: window.scrollY });
        return;
      }
      if (t instanceof HTMLElement && t.matches(SELECTOR)) {
        const i = containersOf(view).indexOf(t);
        if (i >= 0) viewMemory.setScroll(`${view}:${i}`, { left: t.scrollLeft, top: t.scrollTop });
      }
    };

    // scroll no burbuja: se escucha en fase de captura
    document.addEventListener("scroll", onScroll, true);
    // Si la persona toma el control mientras se restaura, se deja de intervenir.
    const userEvents = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    userEvents.forEach((n) => window.addEventListener(n, stop, { passive: true, once: true }));

    return () => {
      stop();
      document.removeEventListener("scroll", onScroll, true);
      userEvents.forEach((n) => window.removeEventListener(n, stop));
    };
  }, [view]);
}
