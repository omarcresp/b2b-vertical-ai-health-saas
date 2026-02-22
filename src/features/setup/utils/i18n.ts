import { CITY_LABEL_KEYS, DAY_LABEL_KEYS } from "@/features/setup/constants";
import type {
  CityValue,
  DayValue,
  SetupTFunction,
} from "@/features/setup/types";

export function getDayLabel(dayOfWeek: number, t: SetupTFunction) {
  return t(DAY_LABEL_KEYS[dayOfWeek as DayValue]);
}

export function getCityLabel(city: CityValue, t: SetupTFunction) {
  return t(CITY_LABEL_KEYS[city]);
}
