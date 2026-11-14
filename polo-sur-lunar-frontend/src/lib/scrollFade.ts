/**
 * Desvanecido según el scroll: marca con data-fade-top / data-fade-bottom los contenedores con scroll interno.
 * El CSS aplica el degradado solo en el borde hacia el que todavía hay contenido
 * (arriba si ya bajaste, abajo si aún falta por bajar).
 */
const SELECTOR = ".detail-body, .side";
const EDGE = 4;

function mark(el: HTMLElement): void {
  const max = el.scrollHeight - el.clientHeight;
  const scrollable = max > EDGE;
  el.dataset.fadeTop = scrollable && el.scrollTop > EDGE ? "1" : "0";
  el.dataset.fadeBottom = scrollable && el.scrollTop < max - EDGE ? "1" : "0";
}

export function initScrollFade(): void {
  let raf = 0;
  const all = (): void => {
    raf = 0;
    document.querySelectorAll<HTMLElement>(SELECTOR).forEach(mark);
  };
  const schedule = (): void => {
    if (raf === 0) raf = requestAnimationFrame(all);
  };

  // scroll no burbujea: se escucha en fase de captura
  document.addEventListener(
    "scroll",
    (e) => {
      const t = e.target;
      if (t instanceof HTMLElement && t.matches(SELECTOR)) mark(t);
    },
    true,
  );
  window.addEventListener("resize", schedule);
  // cambios de vista o de contenido
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(schedule);
    ro.observe(document.body);
  }
  schedule();
}
