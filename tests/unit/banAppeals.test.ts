import { describe, expect, it } from "vitest";
import { appealReviewCustomId, getAppealGuildId, isAppealGuild, parseAppealReviewButton } from "../../src/systems/banAppeals.js";
import type { Env } from "../../src/config/env.js";

describe("banAppeals", () => {
  it("uses the configured appeal guild with the required default fallback", () => {
    expect(getAppealGuildId({ APPEAL_GUILD_ID: "custom" } as Env)).toBe("custom");
    expect(getAppealGuildId({} as Env)).toBe("1490191877960503457");
    expect(isAppealGuild("1490191877960503457", {} as Env)).toBe(true);
  });

  it("parses staff review button custom ids", () => {
    const customId = appealReviewCustomId("approve", "123");

    expect(parseAppealReviewButton(customId)).toEqual({ action: "approve", userId: "123" });
    expect(parseAppealReviewButton("other:approve:123")).toBeNull();
  });
});
