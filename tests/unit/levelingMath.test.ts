import { describe, expect, it } from "vitest";
import { xpToLevel } from "../../src/core/services/userProfileService.js";

describe("xpToLevel", () => {
  it("increases level as xp grows", () => {
    expect(xpToLevel(0)).toBe(0);
    expect(xpToLevel(400)).toBeGreaterThan(xpToLevel(100));
  });
});
