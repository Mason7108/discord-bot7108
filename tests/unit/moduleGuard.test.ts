import { describe, expect, it } from "vitest";
import { isModuleEnabled } from "../../src/core/guards/moduleGuard.js";
import type { CommandDefinition, GuildSettingsShape } from "../../src/core/types.js";

const command = {
  module: "music"
} as CommandDefinition;

const settings: GuildSettingsShape = {
  guildId: "1",
  modules: {
    moderation: true,
    logging: true,
    utility: true,
    economy: true,
    leveling: true,
    music: false,
    tickets: true,
    giveaways: true,
    fun: true,
    admin: true
  },
  automod: {
    enabled: true,
    antiSpam: true,
    antiRaid: true,
    linkFilter: false,
    capsFilter: true,
    blacklist: [],
    spamThreshold: 6,
    spamIntervalSec: 8,
    maxCapsRatio: 0.7
  },
  staffRoleIds: [],
  levelRoles: [],
  economyEnabled: true,
  music247Enabled: false,
  rolePolicy: {
    adminRoleIds: [],
    moderatorRoleIds: [],
    helperRoleIds: []
  }
};

describe("moduleGuard", () => {
  it("returns false for disabled module", () => {
    expect(isModuleEnabled(command, settings)).toBe(false);
  });
});
