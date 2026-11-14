import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

type Loaded<P extends object> = { readonly default: ComponentType<P> };
export type LazyModule<P extends object> = LazyExoticComponent<ComponentType<P>> & {
  /** Empieza a descargar el módulo sin mostrarlo (al pasar el ratón, en reposo...). No hace nada si ya llegó. */
  readonly preload: () => void;
};

const wait = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

/** Una red inestable no debería dejar una pestaña rota: se reintenta la descarga antes de rendirse. */
async function withRetry<T>(load: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i += 1) {
    try {
      return await load();
    } catch (e) {
      last = e;
      if (i < tries - 1) await wait(300 * (i + 1));
    }
  }
  throw last;
}

/**
 * React.lazy con reintentos y precarga. Comparte una sola descarga entre `preload()` y el render:
 * si ya se precargó, al abrir la vista el módulo está listo y no se ve ningún estado de carga.
 */
export function lazyModule<P extends object>(load: () => Promise<Loaded<P>>): LazyModule<P> {
  let pending: Promise<Loaded<P>> | null = null;
  const once = (): Promise<Loaded<P>> => {
    if (pending === null) {
      pending = withRetry(load).catch((e: unknown) => {
        pending = null; // permite volver a intentarlo más tarde
        throw e;
      });
    }
    return pending;
  };
  return Object.assign(lazy(once), {
    preload: (): void => {
      void once().catch(() => undefined);
    },
  });
}
