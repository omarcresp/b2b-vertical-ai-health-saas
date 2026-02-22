import { useTranslation } from "react-i18next";
import {
  CITY_OPTIONS,
  FIELD_LABEL_CLASS,
  INPUT_CLASS,
} from "@/features/setup/constants";
import type { CityValue } from "@/features/setup/types";
import { getCityLabel } from "@/features/setup/utils/i18n";

export function CityField({
  value,
  onChange,
}: Readonly<{
  value: CityValue;
  onChange: (value: CityValue) => void;
}>) {
  const { t } = useTranslation(["setup", "common"]);

  return (
    <label className={FIELD_LABEL_CLASS}>
      {t("setup:identity.fields.city")}
      <select
        className={INPUT_CLASS}
        onChange={(event) => onChange(event.target.value as CityValue)}
        value={value}
      >
        {CITY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {getCityLabel(option.value, t)}
          </option>
        ))}
      </select>
    </label>
  );
}
