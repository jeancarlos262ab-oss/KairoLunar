import type { ReactElement, ReactNode } from "react";
import { useEasy } from "../../state/mode";

interface PanelProps {
  readonly title: string;
  readonly right?: ReactNode | undefined;
  readonly className?: string | undefined;
  /** Explicación en lenguaje llano; solo se muestra en modo Fácil. */
  readonly help?: ReactNode | undefined;
  readonly children: ReactNode;
}

export default function Panel({ title, right, className, help, children }: PanelProps): ReactElement {
  const easy = useEasy();
  return (
    <section className={`panel ${className ?? ""}`.trim()}>
      <header className="panel-head">
        <h2 className="panel-title">{title}</h2>
        {right !== undefined && <div className="panel-right">{right}</div>}
      </header>
      {easy && help !== undefined && (
        <p className="panel-help">
          <i aria-hidden="true">i</i>
          <span>{help}</span>
        </p>
      )}
      {children}
    </section>
  );
}
