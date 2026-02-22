import { describe, expect, it } from "vitest";
import { validateAppRouteSearch } from "./_authed/app";

describe("validateAppRouteSearch", () => {
  it("keeps valid clinicSlug and providerName", () => {
    expect(
      validateAppRouteSearch({
        clinicSlug: "clinica-centro",
        providerName: "Dr. Rivera",
      }),
    ).toEqual({
      clinicSlug: "clinica-centro",
      providerName: "Dr. Rivera",
    });
  });

  it("drops invalid or empty values", () => {
    expect(
      validateAppRouteSearch({
        clinicSlug: "invalid slug",
        providerName: "   ",
      }),
    ).toEqual({
      clinicSlug: undefined,
      providerName: undefined,
    });
  });

  it("returns undefined fields when missing", () => {
    expect(validateAppRouteSearch({})).toEqual({
      clinicSlug: undefined,
      providerName: undefined,
    });
  });
});
