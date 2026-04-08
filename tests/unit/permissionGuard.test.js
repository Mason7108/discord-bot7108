import { describe, expect, it } from "vitest";
import { hasPermissionForCommand } from "../../src/core/guards/permissionGuard.js";
function mockMember(permissionResult, roleIds) {
    return {
        permissions: {
            has: () => permissionResult
        },
        roles: {
            cache: {
                has: (id) => roleIds.includes(id)
            }
        }
    };
}
const settings = {
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
        enabled: true,
        antiSpam: true,
        antiRaid: true,
        linkFilter: false,
        capsFilter: true,
        blacklist: [],
        spamThreshold: 5,
        spamIntervalSec: 8,
        maxCapsRatio: 0.7
    },
    staffRoleIds: [],
    levelRoles: [],
    economyEnabled: true,
    music247Enabled: false,
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
};
describe("permissionGuard", () => {
    it("fails when role policy not satisfied", () => {
        const result = hasPermissionForCommand(command, mockMember(true, ["mod-role"]), settings, mockMember(true, []));
        expect(result.ok).toBe(false);
    });
    it("passes when admin role matches policy", () => {
        const result = hasPermissionForCommand(command, mockMember(true, ["admin-role"]), settings, mockMember(true, []));
        expect(result.ok).toBe(true);
    });
});
