import { Component, lazy, Suspense, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import type { MoonFrame, SiteAnalysis } from "../../engine/index";
import { hasWebGL } from "../../lib/webgl";
import { lazyModule } from "../../lib/lazy";

// El respaldo 2D solo se usa sin WebGL (o si el 3D falla): no se descarga en el caso normal.
const MoonHero2D = lazyModule(() => import("./MoonHero2D"));

// three.js pesa: solo se descarga si el equipo soporta WebGL. Mientras llega no se muestra nada (sin parpadeo a 2D).
const MoonHero3D = lazy(() => import("./MoonHero3D"));

interface Props {
  readonly analyses: readonly SiteAnalysis[];
  readonly selectedId: string;
  readonly frame: MoonFrame | undefined;
  readonly idx: number;
  readonly mask: number;
  readonly onSelect: (id: string) => void;
  /** Vista despejada: globo grande y centrado. */
  readonly centered?: boolean | undefined;
}

/** Si el 3D lanza un error (p. ej. no se pudo cargar el chunk), se muestra el respaldo 2D en vez de una pantalla en blanco. */
class Boundary extends Component<{ readonly fallback: ReactNode; readonly onError: () => void; readonly children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(): void {
    this.props.onError();
  }
  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Planeta de inicio: Luna 3D siempre que el equipo tenga WebGL (igual que el terreno 3D).
 * La versión 2D es solo el respaldo cuando no hay WebGL o el contexto no se pudo crear.
 */
let gl3dBroken = false;

export default function MoonHero(props: Props): ReactElement {
  const [failed, setFailed] = useState<boolean>(() => gl3dBroken || !hasWebGL());
  const give = (): void => {
    gl3dBroken = true;
    setFailed(true);
  };
  const flat = (
    <Suspense fallback={null}>
      <MoonHero2D {...props} />
    </Suspense>
  );
  if (failed) return flat;
  return (
    <Boundary fallback={flat} onError={give}>
      <Suspense fallback={null}>
        <MoonHero3D {...props} onFail={give} />
      </Suspense>
    </Boundary>
  );
}
