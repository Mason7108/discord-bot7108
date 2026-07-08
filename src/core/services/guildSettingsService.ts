import {
  DEFAULT_AUTOMOD,
  DEFAULT_MODULE_STATE,
  DEFAULT_ROLE_POLICY,
  DEFAULT_VOICE_COMMANDS,
  DEFAULT_VOICE_TEXT_TO_SPEECH,
  MODULE_NAMES
} from "../constants.js";
import { GuildSettingsModel } from "../../models/GuildSettings.js";
import type { AutoModSettings, GuildSettingsShape, ModuleName, VoiceCommandSettings, VoiceTextToSpeechSettings } from "../types.js";

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

function normalizeVoiceCommands(raw: Partial<VoiceCommandSettings> | undefined): VoiceCommandSettings {
  return {
    ...DEFAULT_VOICE_COMMANDS,
    ...raw,
    enabled: raw?.enabled ?? DEFAULT_VOICE_COMMANDS.enabled
  };
}

function normalizeVoiceTextToSpeech(raw: Partial<VoiceTextToSpeechSettings> | undefined): VoiceTextToSpeechSettings {
  return {
    ...DEFAULT_VOICE_TEXT_TO_SPEECH,
    ...raw,
    enabled: raw?.enabled ?? DEFAULT_VOICE_TEXT_TO_SPEECH.enabled
  };
}

export async function getGuildSettings(guildId: string): Promise<GuildSettingsShape> {
  const existing = await GuildSettingsModel.findOne({ guildId }).lean<GuildSettingsShape | null>();

  if (existing) {
    return {
      ...existing,
      modules: normalizeModules(existing.modules),
      automod: normalizeAutomod(existing.automod),
      gamblingEnabled: existing.gamblingEnabled ?? true,
      voiceCommands: normalizeVoiceCommands(existing.voiceCommands),
      voiceTextToSpeech: normalizeVoiceTextToSpeech(existing.voiceTextToSpeech)
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
    voiceCommands: normalizeVoiceCommands(created.voiceCommands),
    voiceTextToSpeech: normalizeVoiceTextToSpeech(created.voiceTextToSpeech),
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
    gamblingEnabled: updated.gamblingEnabled ?? true,
    voiceCommands: normalizeVoiceCommands(updated.voiceCommands),
    voiceTextToSpeech: normalizeVoiceTextToSpeech(updated.voiceTextToSpeech)
  };
}
