import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModeToggle } from "@/components/mode-toggle";
import { ThemeProvider } from "@/components/theme-provider";

function setupMatchMedia(initialDark: boolean) {
  let isDark = initialDark;

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      get matches() {
        return isDark;
      },
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  return {
    setSystemTheme: (value: boolean) => {
      isDark = value;
    },
  };
}

describe("ModeToggle", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("light", "dark");
    window.localStorage.clear();
    setupMatchMedia(false);
  });

  it("switches between dark, light, and system themes", async () => {
    const user = userEvent.setup();
    const { setSystemTheme } = setupMatchMedia(false);

    render(
      <ThemeProvider>
        <ModeToggle />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Toggle theme" }));
    await user.click(screen.getByRole("menuitem", { name: "Dark" }));
    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
    });
    expect(window.localStorage.getItem("vite-ui-theme")).toBe("dark");

    await user.click(screen.getByRole("button", { name: "Toggle theme" }));
    await user.click(screen.getByRole("menuitem", { name: "Light" }));
    await waitFor(() => {
      expect(document.documentElement).toHaveClass("light");
    });
    expect(window.localStorage.getItem("vite-ui-theme")).toBe("light");

    setSystemTheme(true);
    await user.click(screen.getByRole("button", { name: "Toggle theme" }));
    await user.click(screen.getByRole("menuitem", { name: "System" }));
    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
    });
    expect(window.localStorage.getItem("vite-ui-theme")).toBe("system");
  });
});
