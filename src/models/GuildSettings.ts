import { model, Schema, type Document } from "mongoose";
import {
  DEFAULT_AUTOMOD,
  DEFAULT_LOGGING,
  DEFAULT_MODULE_STATE,
  DEFAULT_MUSIC_SETTINGS,
  DEFAULT_ROLE_POLICY,
  DEFAULT_TICKET_SETTINGS,
  DEFAULT_VOICE_TEXT_TO_SPEECH,
  DEFAULT_WELCOME
} from "../core/constants.js";
import type { GuildSettingsShape } from "../core/types.js";

export interface GuildSettingsDocument extends Document, GuildSettingsShape {}

const levelRoleSchema = new Schema(
  {
    level: { type: Number, required: true, min: 1 },
    roleId: { type: String, required: true }
  },
  { _id: false }
);

const logCategorySchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    channelId: { type: String }
  },
  { _id: false }
);

const guildSettingsSchema = new Schema<GuildSettingsDocument>(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    modules: {
      moderation: { type: Boolean, default: DEFAULT_MODULE_STATE.moderation },
      logging: { type: Boolean, default: DEFAULT_MODULE_STATE.logging },
      utility: { type: Boolean, default: DEFAULT_MODULE_STATE.utility },
      economy: { type: Boolean, default: DEFAULT_MODULE_STATE.economy },
      leveling: { type: Boolean, default: DEFAULT_MODULE_STATE.leveling },
      music: { type: Boolean, default: DEFAULT_MODULE_STATE.music },
      tickets: { type: Boolean, default: DEFAULT_MODULE_STATE.tickets },
      giveaways: { type: Boolean, default: DEFAULT_MODULE_STATE.giveaways },
      fun: { type: Boolean, default: DEFAULT_MODULE_STATE.fun },
      admin: { type: Boolean, default: DEFAULT_MODULE_STATE.admin }
    },
    modLogChannelId: { type: String },
    automod: {
      enabled: { type: Boolean, default: DEFAULT_AUTOMOD.enabled },
      antiSpam: { type: Boolean, default: DEFAULT_AUTOMOD.antiSpam },
      antiRaid: { type: Boolean, default: DEFAULT_AUTOMOD.antiRaid },
      discordInviteFilter: { type: Boolean, default: DEFAULT_AUTOMOD.discordInviteFilter },
      linkFilter: { type: Boolean, default: DEFAULT_AUTOMOD.linkFilter },
      capsFilter: { type: Boolean, default: DEFAULT_AUTOMOD.capsFilter },
      blacklist: { type: [String], default: DEFAULT_AUTOMOD.blacklist },
      spamThreshold: { type: Number, default: DEFAULT_AUTOMOD.spamThreshold },
      spamIntervalSec: { type: Number, default: DEFAULT_AUTOMOD.spamIntervalSec },
      maxCapsRatio: { type: Number, default: DEFAULT_AUTOMOD.maxCapsRatio }
    },
    welcome: {
      enabled: { type: Boolean, default: DEFAULT_WELCOME.enabled },
      channelId: { type: String },
      message: { type: String, default: DEFAULT_WELCOME.message },
      goodbyeEnabled: { type: Boolean, default: DEFAULT_WELCOME.goodbyeEnabled },
      goodbyeChannelId: { type: String },
      goodbyeMessage: { type: String, default: DEFAULT_WELCOME.goodbyeMessage },
      dmEnabled: { type: Boolean, default: DEFAULT_WELCOME.dmEnabled },
      dmMessage: { type: String, default: DEFAULT_WELCOME.dmMessage },
      roleId: { type: String }
    },
    logging: {
      moderation: { type: logCategorySchema, default: DEFAULT_LOGGING.moderation },
      messageDelete: { type: logCategorySchema, default: DEFAULT_LOGGING.messageDelete },
      messageEdit: { type: logCategorySchema, default: DEFAULT_LOGGING.messageEdit },
      memberJoin: { type: logCategorySchema, default: DEFAULT_LOGGING.memberJoin },
      memberLeave: { type: logCategorySchema, default: DEFAULT_LOGGING.memberLeave },
      roleUpdates: { type: logCategorySchema, default: DEFAULT_LOGGING.roleUpdates },
      channelUpdates: { type: logCategorySchema, default: DEFAULT_LOGGING.channelUpdates },
      voiceActivity: { type: logCategorySchema, default: DEFAULT_LOGGING.voiceActivity },
      dashboard: { type: logCategorySchema, default: DEFAULT_LOGGING.dashboard },
      automod: { type: logCategorySchema, default: DEFAULT_LOGGING.automod }
    },
    ticketCategoryId: { type: String },
    ticketHistoryChannelId: { type: String },
    ticketSettings: {
      openingChannelId: { type: String },
      welcomeMessage: { type: String, default: DEFAULT_TICKET_SETTINGS.welcomeMessage },
      maxOpenTicketsPerUser: { type: Number, default: DEFAULT_TICKET_SETTINGS.maxOpenTicketsPerUser, min: 1, max: 10 },
      closeConfirmation: { type: Boolean, default: DEFAULT_TICKET_SETTINGS.closeConfirmation },
      transcriptsEnabled: { type: Boolean, default: DEFAULT_TICKET_SETTINGS.transcriptsEnabled }
    },
    staffRoleIds: { type: [String], default: [] },
    levelRoles: { type: [levelRoleSchema], default: [] },
    economyEnabled: { type: Boolean, default: true },
    gamblingEnabled: { type: Boolean, default: true },
    music247Enabled: { type: Boolean, default: false },
    musicSettings: {
      defaultVolume: { type: Number, default: DEFAULT_MUSIC_SETTINGS.defaultVolume, min: 1, max: 100 },
      maximumQueueLength: { type: Number, default: DEFAULT_MUSIC_SETTINGS.maximumQueueLength, min: 1, max: 500 },
      controllerChannelId: { type: String },
      djRoleId: { type: String },
      allowUserPlaylists: { type: Boolean, default: DEFAULT_MUSIC_SETTINGS.allowUserPlaylists },
      leaveWhenEmpty: { type: Boolean, default: DEFAULT_MUSIC_SETTINGS.leaveWhenEmpty },
      idleDisconnectSeconds: { type: Number, default: DEFAULT_MUSIC_SETTINGS.idleDisconnectSeconds, min: 30, max: 3600 }
    },
    voiceCommands: {
      enabled: { type: Boolean, default: false },
      textChannelId: { type: String }
    },
    voiceTextToSpeech: {
      enabled: { type: Boolean, default: DEFAULT_VOICE_TEXT_TO_SPEECH.enabled }
    },
    rolePolicy: {
      adminRoleIds: { type: [String], default: DEFAULT_ROLE_POLICY.adminRoleIds },
      moderatorRoleIds: { type: [String], default: DEFAULT_ROLE_POLICY.moderatorRoleIds },
      helperRoleIds: { type: [String], default: DEFAULT_ROLE_POLICY.helperRoleIds }
    }
  },
  {
    timestamps: true,
    minimize: false
  }
);

export const GuildSettingsModel = model<GuildSettingsDocument>("GuildSettings", guildSettingsSchema);
