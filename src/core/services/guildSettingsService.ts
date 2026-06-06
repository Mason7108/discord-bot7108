import { DEFAULT_AUTOMOD, DEFAULT_MODULE_STATE, DEFAULT_ROLE_POLICY, MODULE_NAMES } from "../constants.js";
import { GuildSettingsModel } from "../../models/GuildSettings.js";
import type { AutoModSettings, GuildSettingsShape, ModuleName } from "../types.js";

function normalizeModules(raw: Partial<Record<ModuleName, boolean>> | undefined): Record<ModuleName, boolean> {
  const result: Record<ModuleName, boolean> = { ...DEFAULT_MODULE_STATE };

  if (!raw) {
    return result;
  }

  for (const key of MODULE_NAMES) {
    if (typeof raw[key] === "boolean") {
      result[key] = raw[key] as boolean;
    }
  }

  return result;
}

function normalizeAutomod(raw: Partial<AutoModSettings> | undefined): AutoModSettings {
  return {
    ...DEFAULT_AUTOMOD,
    ...raw,
    blacklist: Array.isArray(raw?.blacklist) ? raw.blacklist : DEFAULT_AUTOMOD.blacklist
  };
}

export async function getGuildSettings(guildId: string): Promise<GuildSettingsShape> {
  const existing = await GuildSettingsModel.findOne({ guildId }).lean<GuildSettingsShape | null>();

  if (existing) {
    return {
      ...existing,
      modules: normalizeModules(existing.modules),
      automod: normalizeAutomod(existing.automod),
      gamblingEnabled: existing.gamblingEnabled ?? true
    };
  }

  const created = await GuildSettingsModel.create({
    guildId,
    modules: DEFAULT_MODULE_STATE,
    automod: DEFAULT_AUTOMOD,
    rolePolicy: DEFAULT_ROLE_POLICY
  });

  return {
    guildId: created.guildId,
    modules: normalizeModules(created.modules),
    modLogChannelId: created.modLogChannelId,
    automod: normalizeAutomod(created.automod),
    ticketCategoryId: created.ticketCategoryId,
    ticketHistoryChannelId: created.ticketHistoryChannelId,
    staffRoleIds: created.staffRoleIds,
    levelRoles: created.levelRoles,
    economyEnabled: created.economyEnabled,
    gamblingEnabled: created.gamblingEnabled,
    music247Enabled: created.music247Enabled,
    rolePolicy: created.rolePolicy
  };
}

export async function updateGuildSettings(
  guildId: string,
  payload: Partial<GuildSettingsShape>
): Promise<GuildSettingsShape | null> {
  const updated = await GuildSettingsModel.findOneAndUpdate(
    { guildId },
    {
      $set: payload
    },
    { new: true, upsert: true }
  ).lean<GuildSettingsShape | null>();

  if (!updated) {
    return null;
  }

  return {
    ...updated,
    modules: normalizeModules(updated.modules),
    automod: normalizeAutomod(updated.automod),
    gamblingEnabled: updated.gamblingEnabled ?? true
  };
}
