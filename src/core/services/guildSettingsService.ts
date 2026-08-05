import {
  DEFAULT_AUTOMOD,
  DEFAULT_LOGGING,
  DEFAULT_MODULE_STATE,
  DEFAULT_MUSIC_SETTINGS,
  DEFAULT_ROLE_POLICY,
  DEFAULT_TICKET_SETTINGS,
  DEFAULT_VOICE_COMMANDS,
  DEFAULT_VOICE_TEXT_TO_SPEECH,
  DEFAULT_WELCOME,
  MODULE_NAMES
} from "../constants.js";
import { GuildSettingsModel } from "../../models/GuildSettings.js";
import type {
  AutoModSettings,
  GuildSettingsShape,
  LoggingSettings,
  ModuleName,
  MusicSettings,
  TicketSettings,
  VoiceCommandSettings,
  VoiceTextToSpeechSettings,
  WelcomeSettings
} from "../types.js";

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

function normalizeWelcome(raw: Partial<WelcomeSettings> | undefined): WelcomeSettings {
  return {
    ...DEFAULT_WELCOME,
    ...raw,
    message: typeof raw?.message === "string" ? raw.message : DEFAULT_WELCOME.message,
    goodbyeMessage: typeof raw?.goodbyeMessage === "string" ? raw.goodbyeMessage : DEFAULT_WELCOME.goodbyeMessage,
    dmMessage: typeof raw?.dmMessage === "string" ? raw.dmMessage : DEFAULT_WELCOME.dmMessage
  };
}

function normalizeLogCategory(raw: { enabled?: boolean; channelId?: string } | undefined, defaults: { enabled: boolean; channelId?: string }) {
  return {
    enabled: raw?.enabled ?? defaults.enabled,
    channelId: raw?.channelId ?? defaults.channelId
  };
}

function normalizeLogging(raw: Partial<LoggingSettings> | undefined): LoggingSettings {
  return {
    moderation: normalizeLogCategory(raw?.moderation, DEFAULT_LOGGING.moderation),
    messageDelete: normalizeLogCategory(raw?.messageDelete, DEFAULT_LOGGING.messageDelete),
    messageEdit: normalizeLogCategory(raw?.messageEdit, DEFAULT_LOGGING.messageEdit),
    memberJoin: normalizeLogCategory(raw?.memberJoin, DEFAULT_LOGGING.memberJoin),
    memberLeave: normalizeLogCategory(raw?.memberLeave, DEFAULT_LOGGING.memberLeave),
    roleUpdates: normalizeLogCategory(raw?.roleUpdates, DEFAULT_LOGGING.roleUpdates),
    channelUpdates: normalizeLogCategory(raw?.channelUpdates, DEFAULT_LOGGING.channelUpdates),
    voiceActivity: normalizeLogCategory(raw?.voiceActivity, DEFAULT_LOGGING.voiceActivity),
    dashboard: normalizeLogCategory(raw?.dashboard, DEFAULT_LOGGING.dashboard),
    automod: normalizeLogCategory(raw?.automod, DEFAULT_LOGGING.automod)
  };
}

function normalizeMusicSettings(raw: Partial<MusicSettings> | undefined): MusicSettings {
  return {
    ...DEFAULT_MUSIC_SETTINGS,
    ...raw,
    defaultVolume: raw?.defaultVolume ?? DEFAULT_MUSIC_SETTINGS.defaultVolume,
    maximumQueueLength: raw?.maximumQueueLength ?? DEFAULT_MUSIC_SETTINGS.maximumQueueLength,
    idleDisconnectSeconds: raw?.idleDisconnectSeconds ?? DEFAULT_MUSIC_SETTINGS.idleDisconnectSeconds
  };
}

function normalizeTicketSettings(raw: Partial<TicketSettings> | undefined): TicketSettings {
  return {
    ...DEFAULT_TICKET_SETTINGS,
    ...raw,
    welcomeMessage: typeof raw?.welcomeMessage === "string" ? raw.welcomeMessage : DEFAULT_TICKET_SETTINGS.welcomeMessage,
    maxOpenTicketsPerUser: raw?.maxOpenTicketsPerUser ?? DEFAULT_TICKET_SETTINGS.maxOpenTicketsPerUser
  };
}

function normalizeGuildSettings(settings: GuildSettingsShape): GuildSettingsShape {
  return {
    ...settings,
    modules: normalizeModules(settings.modules),
    automod: normalizeAutomod(settings.automod),
    welcome: normalizeWelcome(settings.welcome),
    logging: normalizeLogging(settings.logging),
    ticketSettings: normalizeTicketSettings(settings.ticketSettings),
    gamblingEnabled: settings.gamblingEnabled ?? true,
    musicSettings: normalizeMusicSettings(settings.musicSettings),
    voiceCommands: normalizeVoiceCommands(settings.voiceCommands),
    voiceTextToSpeech: normalizeVoiceTextToSpeech(settings.voiceTextToSpeech)
  };
}

export async function getGuildSettings(guildId: string): Promise<GuildSettingsShape> {
  const existing = await GuildSettingsModel.findOne({ guildId }).lean<GuildSettingsShape | null>();

  if (existing) {
    return normalizeGuildSettings(existing);
  }

  const created = await GuildSettingsModel.create({
    guildId,
    modules: DEFAULT_MODULE_STATE,
    automod: DEFAULT_AUTOMOD,
    welcome: DEFAULT_WELCOME,
    logging: DEFAULT_LOGGING,
    ticketSettings: DEFAULT_TICKET_SETTINGS,
    musicSettings: DEFAULT_MUSIC_SETTINGS,
    voiceTextToSpeech: DEFAULT_VOICE_TEXT_TO_SPEECH,
    rolePolicy: DEFAULT_ROLE_POLICY
  });

  return normalizeGuildSettings({
    guildId: created.guildId,
    modules: normalizeModules(created.modules),
    modLogChannelId: created.modLogChannelId,
    automod: normalizeAutomod(created.automod),
    welcome: normalizeWelcome(created.welcome),
    logging: normalizeLogging(created.logging),
    ticketCategoryId: created.ticketCategoryId,
    ticketHistoryChannelId: created.ticketHistoryChannelId,
    ticketSettings: normalizeTicketSettings(created.ticketSettings),
    staffRoleIds: created.staffRoleIds,
    levelRoles: created.levelRoles,
    economyEnabled: created.economyEnabled,
    gamblingEnabled: created.gamblingEnabled,
    music247Enabled: created.music247Enabled,
    musicSettings: normalizeMusicSettings(created.musicSettings),
    voiceCommands: normalizeVoiceCommands(created.voiceCommands),
    voiceTextToSpeech: normalizeVoiceTextToSpeech(created.voiceTextToSpeech),
    rolePolicy: created.rolePolicy
  });
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

  return normalizeGuildSettings(updated);
}
