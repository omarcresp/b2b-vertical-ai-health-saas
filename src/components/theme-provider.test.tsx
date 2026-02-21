import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "@/components/theme-provider";

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

function ThemeTestHarness() {
  const { setTheme } = useTheme();

  return (
    <div>
      <button type="button" onClick={() => setTheme("light")}>
        Set light
      </button>
      <button type="button" onClick={() => setTheme("dark")}>
        Set dark
      </button>
      <button type="button" onClick={() => setTheme("system")}>
        Set system
      </button>
    </div>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("light", "dark");
    window.localStorage.clear();
    setupMatchMedia(false);
  });

  it("applies system dark class by default", async () => {
    setupMatchMedia(true);
    render(
      <ThemeProvider>
        <div>child</div>
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
    });
    expect(document.documentElement).not.toHaveClass("light");
  });

  it("restores and applies a stored theme value", async () => {
    window.localStorage.setItem("vite-ui-theme", "dark");
    render(
      <ThemeProvider>
        <div>child</div>
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
    });
  });

  it("sets html class and persists value for light, dark, and system", async () => {
    const user = userEvent.setup();
    const { setSystemTheme } = setupMatchMedia(false);

    render(
      <ThemeProvider>
        <ThemeTestHarness />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Set dark" }));
    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
    });
    expect(window.localStorage.getItem("vite-ui-theme")).toBe("dark");

    await user.click(screen.getByRole("button", { name: "Set light" }));
    await waitFor(() => {
      expect(document.documentElement).toHaveClass("light");
    });
    expect(window.localStorage.getItem("vite-ui-theme")).toBe("light");

    setSystemTheme(false);
    await user.click(screen.getByRole("button", { name: "Set system" }));
    await waitFor(() => {
      expect(document.documentElement).toHaveClass("light");
    });
    expect(window.localStorage.getItem("vite-ui-theme")).toBe("system");
  });
});
