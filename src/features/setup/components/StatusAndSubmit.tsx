import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CARD_CLASS } from "@/features/setup/constants";
import type { SetupModel } from "@/features/setup/hooks/useSetupModel";

export function StatusAndSubmit({ model }: Readonly<{ model: SetupModel }>) {
  const { t } = useTranslation(["setup", "common"]);

  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex flex-wrap items-center gap-3">
        {model.formError ? (
          <p className="text-sm font-medium text-destructive">
            {model.formError}
          </p>
        ) : null}
        {model.submitMessage ? (
          <p className="text-sm font-medium text-primary">
            {model.submitMessage}
          </p>
        ) : null}
      </div>
      <Button
        className="mt-4 w-full rounded-xl sm:w-auto"
        onClick={() => model.submitSetup()}
        type="button"
      >
        {model.isSubmitting
          ? t("setup:submit.saving")
          : t("setup:submit.saveSetup")}
      </Button>
    </section>
  );
}
