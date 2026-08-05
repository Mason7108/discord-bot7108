import { describe, expect, it } from "vitest";
import { DEFAULT_AUTOMOD, DEFAULT_LOGGING, DEFAULT_MUSIC_SETTINGS, DEFAULT_TICKET_SETTINGS, DEFAULT_WELCOME } from "../../src/core/constants.js";
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
  automod: DEFAULT_AUTOMOD,
  welcome: DEFAULT_WELCOME,
  logging: DEFAULT_LOGGING,
  staffRoleIds: [],
  ticketSettings: DEFAULT_TICKET_SETTINGS,
  levelRoles: [],
  economyEnabled: true,
  gamblingEnabled: true,
  music247Enabled: false,
  musicSettings: DEFAULT_MUSIC_SETTINGS,
  voiceCommands: {
    enabled: false
  },
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
