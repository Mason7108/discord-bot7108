import { describe, expect, it } from "vitest";
import { isCommandRestrictionActive } from "../../src/core/services/commandRestrictionService.js";

describe("commandRestrictionService", () => {
  it("keeps permanent and future restrictions active", () => {
    const now = new Date("2026-06-06T12:00:00Z");

    expect(isCommandRestrictionActive({}, now)).toBe(true);
    expect(isCommandRestrictionActive({ expiresAt: new Date("2026-06-06T12:01:00Z") }, now)).toBe(true);
  });

  it("treats expired restrictions as inactive", () => {
    const now = new Date("2026-06-06T12:00:00Z");

    expect(isCommandRestrictionActive({ expiresAt: new Date("2026-06-06T11:59:59Z") }, now)).toBe(false);
  });
});
