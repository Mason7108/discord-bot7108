import { model, Schema, type Document } from "mongoose";
import { DEFAULT_AUTOMOD, DEFAULT_MODULE_STATE, DEFAULT_ROLE_POLICY } from "../core/constants.js";
import type { GuildSettingsShape } from "../core/types.js";

export interface GuildSettingsDocument extends Document, GuildSettingsShape {}

const levelRoleSchema = new Schema(
  {
    level: { type: Number, required: true, min: 1 },
    roleId: { type: String, required: true }
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
      linkFilter: { type: Boolean, default: DEFAULT_AUTOMOD.linkFilter },
      capsFilter: { type: Boolean, default: DEFAULT_AUTOMOD.capsFilter },
      blacklist: { type: [String], default: DEFAULT_AUTOMOD.blacklist },
      spamThreshold: { type: Number, default: DEFAULT_AUTOMOD.spamThreshold },
      spamIntervalSec: { type: Number, default: DEFAULT_AUTOMOD.spamIntervalSec },
      maxCapsRatio: { type: Number, default: DEFAULT_AUTOMOD.maxCapsRatio }
    },
    ticketCategoryId: { type: String },
    staffRoleIds: { type: [String], default: [] },
    levelRoles: { type: [levelRoleSchema], default: [] },
    economyEnabled: { type: Boolean, default: true },
    music247Enabled: { type: Boolean, default: false },
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
