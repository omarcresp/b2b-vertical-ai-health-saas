import type { CityValue, DayValue, TemplatePreset } from "./types";

export const CITY_OPTIONS = [
  {
    value: "cdmx",
    timezone: "America/Mexico_City",
  },
  {
    value: "bogota",
    timezone: "America/Bogota",
  },
] as const;

export const CITY_LABEL_KEYS = {
  cdmx: "setup:cities.cdmx",
  bogota: "setup:cities.bogota",
} as const satisfies Record<CityValue, `setup:cities.${string}`>;

export const DAY_VALUES = [0, 1, 2, 3, 4, 5, 6] as const;

export const DAY_LABEL_KEYS = {
  0: "setup:days.0",
  1: "setup:days.1",
  2: "setup:days.2",
  3: "setup:days.3",
  4: "setup:days.4",
  5: "setup:days.5",
  6: "setup:days.6",
} as const satisfies Record<DayValue, `setup:days.${DayValue}`>;

export const FIELD_LABEL_CLASS =
  "text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase";
export const INPUT_CLASS =
  "mt-2 h-10 w-full rounded-xl border border-input/80 bg-background/90 px-3 text-sm text-foreground outline-none ring-offset-background transition focus:border-ring focus:ring-2 focus:ring-ring/30";
export const CARD_CLASS =
  "rounded-2xl border border-border/80 bg-card/95 text-card-foreground shadow-sm backdrop-blur";

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: "weekday",
    labelKey: "setup:templates.weekday.label",
    descriptionKey: "setup:templates.weekday.description",
    windows: [
      { dayOfWeek: 1, start: "09:00", end: "17:00" },
      { dayOfWeek: 2, start: "09:00", end: "17:00" },
      { dayOfWeek: 3, start: "09:00", end: "17:00" },
      { dayOfWeek: 4, start: "09:00", end: "17:00" },
      { dayOfWeek: 5, start: "09:00", end: "17:00" },
    ],
  },
  {
    id: "extended",
    labelKey: "setup:templates.extended.label",
    descriptionKey: "setup:templates.extended.description",
    windows: [
      { dayOfWeek: 1, start: "08:00", end: "18:00" },
      { dayOfWeek: 2, start: "08:00", end: "18:00" },
      { dayOfWeek: 3, start: "08:00", end: "18:00" },
      { dayOfWeek: 4, start: "08:00", end: "18:00" },
      { dayOfWeek: 5, start: "08:00", end: "18:00" },
      { dayOfWeek: 6, start: "08:00", end: "14:00" },
    ],
  },
  {
    id: "split",
    labelKey: "setup:templates.split.label",
    descriptionKey: "setup:templates.split.description",
    windows: [
      { dayOfWeek: 1, start: "08:00", end: "12:00" },
      { dayOfWeek: 1, start: "14:00", end: "18:00" },
      { dayOfWeek: 2, start: "08:00", end: "12:00" },
      { dayOfWeek: 2, start: "14:00", end: "18:00" },
      { dayOfWeek: 3, start: "08:00", end: "12:00" },
      { dayOfWeek: 3, start: "14:00", end: "18:00" },
      { dayOfWeek: 4, start: "08:00", end: "12:00" },
      { dayOfWeek: 4, start: "14:00", end: "18:00" },
      { dayOfWeek: 5, start: "08:00", end: "12:00" },
      { dayOfWeek: 5, start: "14:00", end: "18:00" },
    ],
  },
];
