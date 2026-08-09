import { ActivityType } from "discord.js";
import type { BotClient } from "../types.js";
import {
  BotControlSettingsModel,
  type BotActivityKind,
  type BotPresenceStatus
} from "../../models/BotControlSettings.js";

export interface BotControlSettingsShape {
  presenceStatus: BotPresenceStatus;
  activityType: BotActivityKind;
  activityText: string;
  updatedById?: string;
}

export const DEFAULT_BOT_CONTROL_SETTINGS: BotControlSettingsShape = {
  presenceStatus: "online",
  activityType: "playing",
  activityText: ""
};

const activityTypes: Record<BotActivityKind, ActivityType> = {
  playing: ActivityType.Playing,
  listening: ActivityType.Listening,
  watching: ActivityType.Watching,
  competing: ActivityType.Competing
};

export async function getBotControlSettings(): Promise<BotControlSettingsShape> {
  const settings = await BotControlSettingsModel.findOne({ key: "global" }).lean();
  if (!settings) {
    return { ...DEFAULT_BOT_CONTROL_SETTINGS };
  }

  return {
    presenceStatus: settings.presenceStatus,
    activityType: settings.activityType,
    activityText: settings.activityText,
    updatedById: settings.updatedById
  };
}

export async function saveBotControlSettings(
  patch: Partial<BotControlSettingsShape> & { updatedById: string }
): Promise<BotControlSettingsShape> {
  const updated = await BotControlSettingsModel.findOneAndUpdate(
    { key: "global" },
    { $set: patch, $setOnInsert: { key: "global" } },
    { upsert: true, new: true, runValidators: true }
  ).lean();

  return {
    presenceStatus: updated?.presenceStatus ?? DEFAULT_BOT_CONTROL_SETTINGS.presenceStatus,
    activityType: updated?.activityType ?? DEFAULT_BOT_CONTROL_SETTINGS.activityType,
    activityText: updated?.activityText ?? DEFAULT_BOT_CONTROL_SETTINGS.activityText,
    updatedById: updated?.updatedById
  };
}

export function applyBotPresence(client: BotClient, settings: BotControlSettingsShape): void {
  if (!client.user) {
    throw new Error("Bot user is not ready.");
  }

  client.user.setPresence({
    status: settings.presenceStatus,
    activities: settings.activityText
      ? [{ name: settings.activityText, type: activityTypes[settings.activityType] }]
      : []
  });
}
