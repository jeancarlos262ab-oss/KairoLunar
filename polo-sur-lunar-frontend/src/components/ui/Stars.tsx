import type { ReactElement } from "react";
import { useT } from "../../i18n/i18n";

interface Props {
  readonly value: number;
  readonly label: string;
}

export default function Stars({ value, label }: Props): ReactElement {
  const t = useT();
  return (
    <span className="stars" role="img" aria-label={t("stars.aria", { label, n: value })}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={i <= value ? "on" : ""} aria-hidden="true">
          ★
        </i>
      ))}
    </span>
  );
}
