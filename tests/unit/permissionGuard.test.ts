import { describe, expect, it } from "vitest";
import { DEFAULT_AUTOMOD, DEFAULT_LOGGING, DEFAULT_MUSIC_SETTINGS, DEFAULT_TICKET_SETTINGS, DEFAULT_WELCOME } from "../../src/core/constants.js";
import { hasPermissionForCommand } from "../../src/core/guards/permissionGuard.js";
import type { CommandDefinition, GuildSettingsShape } from "../../src/core/types.js";

function mockMember(permissionResult: boolean, roleIds: string[]) {
  return {
    permissions: {
      has: () => permissionResult
    },
    roles: {
      cache: {
        has: (id: string) => roleIds.includes(id)
      }
    }
  } as any;
}

const settings: GuildSettingsShape = {
  guildId: "1",
  modules: {
    moderation: true,
    logging: true,
    utility: true,
    economy: true,
    leveling: true,
    music: true,
    tickets: true,
    giveaways: true,
    fun: true,
    admin: true
  },
  automod: {
    ...DEFAULT_AUTOMOD
  },
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
    adminRoleIds: ["admin-role"],
    moderatorRoleIds: ["mod-role"],
    helperRoleIds: ["helper-role"]
  }
};

const command = {
  module: "admin",
  data: { name: "x" },
  execute: async () => undefined,
  roleRequirement: "Admin"
} as unknown as CommandDefinition;

describe("permissionGuard", () => {
  it("fails when role policy not satisfied", () => {
    const result = hasPermissionForCommand(command, mockMember(false, ["mod-role"]), settings, mockMember(true, []));
    expect(result.ok).toBe(false);
  });

  it("passes when admin role matches policy", () => {
    const result = hasPermissionForCommand(command, mockMember(false, ["admin-role"]), settings, mockMember(true, []));
    expect(result.ok).toBe(true);
  });
});
