import { describe, expect, it } from "vitest";
import { canPostDiscordInviteLink, containsDiscordInviteLink } from "../../src/systems/automod.js";

describe("automod discord invite filter", () => {
  it("detects common Discord invite links", () => {
    expect(containsDiscordInviteLink("join https://discord.gg/abc123")).toBe(true);
    expect(containsDiscordInviteLink("join discord.com/invite/abc123")).toBe(true);
    expect(containsDiscordInviteLink("join http://discordapp.com/invite/abc123?event=1")).toBe(true);
    expect(containsDiscordInviteLink("regular https://discord.com/channels/1/2/3 link")).toBe(false);
  });

  it("allows only the configured owner, falling back to the guild owner", () => {
    expect(canPostDiscordInviteLink("bot-owner", "guild-owner", "bot-owner")).toBe(true);
    expect(canPostDiscordInviteLink("guild-owner", "guild-owner", "bot-owner")).toBe(false);
    expect(canPostDiscordInviteLink("guild-owner", "guild-owner")).toBe(true);
  });
});
