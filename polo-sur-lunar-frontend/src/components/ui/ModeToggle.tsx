import * as ToggleGroup from "@radix-ui/react-toggle-group";
import type { ReactElement } from "react";
import { useT } from "../../i18n/i18n";
import type { Mode } from "../../state/mode";

interface Props {
  readonly mode: Mode;
  readonly onChange: (m: Mode) => void;
}

export default function ModeToggle({ mode, onChange }: Props): ReactElement {
  const t = useT();
  return (
    <ToggleGroup.Root className="mode-toggle" type="single" value={mode} aria-label={t("mode.aria")} onValueChange={(v) => v && onChange(v as Mode)}>
      <ToggleGroup.Item value="easy">{t("mode.easy")}</ToggleGroup.Item>
      <ToggleGroup.Item value="expert">{t("mode.expert")}</ToggleGroup.Item>
    </ToggleGroup.Root>
  );
}
