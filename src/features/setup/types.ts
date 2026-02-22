import type { TFunction } from "i18next";

export type CityValue = "cdmx" | "bogota";

export type DayValue = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type SetupTFunction = TFunction<["setup", "common"]>;

export type WindowRow = {
  id: number;
  dayOfWeek: DayValue;
  start: string;
  end: string;
};

export type SetupDraft = {
  clinicName: string;
  city: CityValue;
  providerName: string;
  appointmentDurationMin: string;
  slotStepMin: string;
  leadTimeMin: string;
  bookingHorizonDays: string;
};

export type SnapshotKey = {
  clinicSlug: string;
  providerName: string;
};

export type SetupPayload = {
  clinicName: string;
  city: CityValue;
  providerName: string;
  appointmentDurationMin: number;
  slotStepMin: number;
  leadTimeMin: number;
  bookingHorizonDays: number;
  weeklyWindows: {
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
  }[];
};

export type TemplatePreset = {
  id: "weekday" | "extended" | "split";
  labelKey:
    | "setup:templates.weekday.label"
    | "setup:templates.extended.label"
    | "setup:templates.split.label";
  descriptionKey:
    | "setup:templates.weekday.description"
    | "setup:templates.extended.description"
    | "setup:templates.split.description";
  windows: Array<{ dayOfWeek: DayValue; start: string; end: string }>;
};
