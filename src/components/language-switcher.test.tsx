import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LanguageSwitcher } from "@/components/language-switcher";

// i18n is initialized globally by src/test/setup.ts — no mock needed.
// Assertions use the real en-US translations (locale.label = "Language").

describe("LanguageSwitcher — coerceLocaleForSelector", () => {
  it("shows the supported locale as selected (baseline: en-US)", () => {
    render(<LanguageSwitcher currentLocale="en-US" onChange={vi.fn()} />);
    const select = screen.getByRole("combobox", { name: "Language" });
    expect((select as HTMLSelectElement).value).toBe("en-US");
  });

  it("shows es-CO selected for locale es-CO (directly supported)", () => {
    render(<LanguageSwitcher currentLocale="es-CO" onChange={vi.fn()} />);
    const select = screen.getByRole("combobox", { name: "Language" });
    expect((select as HTMLSelectElement).value).toBe("es-CO");
  });

  it("falls back to es-MX for unsupported Spanish locale es-AR", () => {
    render(<LanguageSwitcher currentLocale="es-AR" onChange={vi.fn()} />);
    const select = screen.getByRole("combobox", { name: "Language" });
    expect((select as HTMLSelectElement).value).toBe("es-MX");
  });

  it("falls back to DEFAULT_LOCALE (en-US) for unknown locale fr-FR", () => {
    render(<LanguageSwitcher currentLocale="fr-FR" onChange={vi.fn()} />);
    const select = screen.getByRole("combobox", { name: "Language" });
    expect((select as HTMLSelectElement).value).toBe("en-US");
  });
});
