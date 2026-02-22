import { useTranslation } from "react-i18next";
import type { TemplatePreset } from "@/features/setup/types";

export function TemplateButton({
  activeTemplate,
  onPick,
  preset,
}: Readonly<{
  activeTemplate: TemplatePreset["id"] | null;
  onPick: (presetId: TemplatePreset["id"]) => void;
  preset: TemplatePreset;
}>) {
  const { t } = useTranslation(["setup", "common"]);

  return (
    <button
      className={`rounded-xl border p-3 text-left transition ${
        activeTemplate === preset.id
          ? "border-primary bg-primary/10 shadow-sm"
          : "border-border bg-background hover:border-primary/40 hover:bg-muted/40"
      }`}
      onClick={() => onPick(preset.id)}
      type="button"
    >
      <p className="text-sm font-semibold">{t(preset.labelKey)}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t(preset.descriptionKey)}
      </p>
    </button>
  );
}
