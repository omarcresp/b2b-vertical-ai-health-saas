import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("merges truthy class names", () => {
    expect(cn("p-2", false && "hidden", "m-2")).toBe("p-2 m-2");
  });

  it("resolves tailwind conflicts with last-wins behavior", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
