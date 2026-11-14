import { useRef } from "react";
import type { ReactElement, ReactNode } from "react";
import { ViewActiveContext } from "../../state/viewActive";

interface Props {
  readonly name: string;
  readonly active: boolean;
  readonly children: ReactNode;
}

/**
 * Mantiene montada una vista ya visitada y solo la oculta (display:none) al cambiar de pestaña.
 * Así el globo 3D, el terreno 3D, los gráficos y sus contextos WebGL no se destruyen ni se recargan al volver.
 * Mientras está oculta se reutiliza el último render (no se vuelve a calcular nada que nadie ve).
 * "display: contents" hace que el contenedor no altere el layout en rejilla de .app.
 */
export default function KeepAlive({ name, active, children }: Props): ReactElement {
  const frozen = useRef<ReactNode>(children);
  if (active) frozen.current = children;
  return (
    <ViewActiveContext.Provider value={active}>
      <div data-view-slot={name} style={{ display: active ? "contents" : "none" }}>
        {frozen.current}
      </div>
    </ViewActiveContext.Provider>
  );
}
