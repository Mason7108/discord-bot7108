import { describe, expect, it } from "vitest";
import { buildAppealText, inferPermanentBanFromReason } from "../../src/core/services/banAppealService.js";

describe("banAppealService", () => {
  it("detects permanent bans from common reason wording", () => {
    expect(inferPermanentBanFromReason("Permanent ban for repeated raids")).toBe(true);
    expect(inferPermanentBanFromReason("perm ban - no appeal")).toBe(true);
    expect(inferPermanentBanFromReason("standard moderation action")).toBe(false);
    expect(inferPermanentBanFromReason(undefined)).toBe(false);
  });

  it("formats appeal answers into one stored text field", () => {
    expect(
      buildAppealText({
        bannedReason: "I broke the rules.",
        unbanReason: "I understand the rules now.",
        futureChanges: "I will follow staff instructions."
      })
    ).toContain("What will you do differently?");
  });
});
