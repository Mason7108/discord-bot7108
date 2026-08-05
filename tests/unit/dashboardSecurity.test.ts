import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { evaluateCommandOverride, validateCommandOverride } from "../../src/core/services/commandSettingsService.js";
import { redactAuditValue } from "../../src/core/services/dashboardAuditService.js";
import {
  evaluateModerationTarget,
  hasManageGuildPermissionBits,
  moderationPermissionsForAction
} from "../../src/api/dashboardPermissions.js";
import { dashboardSettingsPatchSchema } from "../../src/api/dashboardValidation.js";
import { checkRateLimit, resetRateLimitBucketsForTests } from "../../src/api/rateLimit.js";
import { hashDashboardValue, requireCsrf, requireDashboardAuth } from "../../src/api/dashboardSecurity.js";

function mockResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    }
  } as any;
}

function mockMember(id: string, position: number, permissions = true) {
  return {
    id,
    permissions: {
      has: () => permissions
    },
    roles: {
      highest: {
        position,
        comparePositionTo(other: { position: number }) {
          return position - other.position;
        }
      },
      cache: {
        has: (roleId: string) => roleId === "allowed-role"
      }
    }
  } as any;
}

describe("dashboard security helpers", () => {
  beforeEach(() => {
    resetRateLimitBucketsForTests();
  });

  it("blocks unauthenticated dashboard requests", () => {
    const res = mockResponse();
    let nextCalled = false;
    requireDashboardAuth({} as any, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it("requires a matching CSRF header", () => {
    const res = mockResponse();
    let nextCalled = false;
    requireCsrf(
      {
        get: () => "csrf-token",
        dashboard: {
          session: { csrfTokenHash: hashDashboardValue("csrf-token") }
        }
      } as any,
      res,
      () => {
        nextCalled = true;
      }
    );

    expect(nextCalled).toBe(true);
  });

  it("rejects invalid CSRF headers", () => {
    const res = mockResponse();
    requireCsrf(
      {
        get: () => "wrong",
        dashboard: {
          session: { csrfTokenHash: hashDashboardValue("csrf-token") }
        }
      } as any,
      res,
      () => undefined
    );

    expect(res.statusCode).toBe(403);
  });

  it("filters manageable guilds by server management permissions", () => {
    expect(hasManageGuildPermissionBits("0", false)).toBe(false);
    expect(hasManageGuildPermissionBits("32", false)).toBe(true);
    expect(hasManageGuildPermissionBits("8", false)).toBe(true);
    expect(hasManageGuildPermissionBits("0", true)).toBe(true);
  });

  it("respects role hierarchy for moderation targets", () => {
    const guild = { ownerId: "owner" } as any;
    const actor = mockMember("actor", 5);
    const botMember = mockMember("bot", 6);
    const target = mockMember("target", 4);

    expect(evaluateModerationTarget({ guild, actor, botMember, target }).ok).toBe(true);
    expect(evaluateModerationTarget({ guild, actor, botMember, target: mockMember("target", 8) }).ok).toBe(false);
    expect(evaluateModerationTarget({ guild, actor, botMember, target: mockMember("owner", 1) }).ok).toBe(false);
    expect(evaluateModerationTarget({ guild, actor, botMember, target: mockMember("actor", 1) }).ok).toBe(false);
  });

  it("requires moderation permissions for dangerous actions", () => {
    expect(moderationPermissionsForAction("ban").destructive).toBe(true);
    expect(moderationPermissionsForAction("ban").user.length).toBeGreaterThan(0);
    expect(moderationPermissionsForAction("warn").destructive).toBe(false);
  });

  it("does not allow disabling essential commands", () => {
    expect(validateCommandOverride("modules", { enabled: false }).ok).toBe(false);
    expect(validateCommandOverride("ping", { enabled: false }).ok).toBe(true);
  });

  it("evaluates command role and channel restrictions", () => {
    const member = mockMember("user", 1, false);
    expect(
      evaluateCommandOverride({
        commandName: "ping",
        member,
        channelId: "channel-1",
        override: {
          guildId: "guild",
          commandName: "ping",
          enabled: true,
          allowedRoleIds: ["allowed-role"],
          allowedChannelIds: ["channel-1"],
          cooldownSec: 5
        }
      }).ok
    ).toBe(true);

    expect(
      evaluateCommandOverride({
        commandName: "ping",
        member,
        channelId: "other",
        override: {
          guildId: "guild",
          commandName: "ping",
          enabled: true,
          allowedRoleIds: [],
          allowedChannelIds: ["channel-1"],
          cooldownSec: 5
        }
      }).ok
    ).toBe(false);
  });

  it("rejects invalid dashboard settings", () => {
    const result = dashboardSettingsPatchSchema.safeParse({
      welcome: {
        message: "<script>alert(1)</script>"
      }
    });
    expect(result.success).toBe(false);
  });

  it("rate limits repeated submissions", () => {
    const first = checkRateLimit({ key: "support:test", limit: 1, windowMs: 60_000, now: 1000 });
    const second = checkRateLimit({ key: "support:test", limit: 1, windowMs: 60_000, now: 1001 });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
  });

  it("redacts sensitive audit values", () => {
    expect(
      redactAuditValue({
        channelId: "123",
        accessToken: "secret-token",
        nested: { sessionSecret: "secret" }
      })
    ).toEqual({
      channelId: "123",
      accessToken: "[redacted]",
      nested: { sessionSecret: "[redacted]" }
    });
  });

  it("does not include secret names in the browser bundle", () => {
    const source = readFileSync(path.join(process.cwd(), "src", "web", "public", "app.js"), "utf8");
    expect(source).not.toMatch(/BOT_TOKEN|DISCORD_BOT_TOKEN|CLIENT_SECRET|SESSION_SECRET|INTERNAL_API_SECRET/);
  });
});
