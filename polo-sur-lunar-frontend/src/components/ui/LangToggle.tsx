import * as ToggleGroup from "@radix-ui/react-toggle-group";
import type { ReactElement } from "react";
import { useT } from "../../i18n/i18n";
import { useStore } from "../../state/store";
import type { Lang } from "../../state/store";

export default function LangToggle(): ReactElement {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  return (
    <ToggleGroup.Root className="mode-toggle lang-toggle" type="single" value={lang} aria-label={t("lang.aria")} onValueChange={(v) => v && setLang(v as Lang)}>
      <ToggleGroup.Item value="en" lang="en" aria-label="English">EN</ToggleGroup.Item>
      <ToggleGroup.Item value="es" lang="es" aria-label="Español">ES</ToggleGroup.Item>
    </ToggleGroup.Root>
  );
}
