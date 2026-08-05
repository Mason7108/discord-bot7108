import type { GuildMember } from "discord.js";
import { CommandSettingsModel } from "../../models/CommandSettings.js";

export const ESSENTIAL_COMMAND_NAMES = new Set(["help", "config", "modules", "commandrestrict"]);

export interface CommandOverride {
  guildId: string;
  commandName: string;
  enabled: boolean;
  allowedRoleIds: string[];
  allowedChannelIds: string[];
  cooldownSec: number;
}

export interface CommandOverrideInput {
  enabled?: boolean;
  allowedRoleIds?: string[];
  allowedChannelIds?: string[];
  cooldownSec?: number;
  updatedById?: string;
}

export function isEssentialCommand(commandName: string): boolean {
  return ESSENTIAL_COMMAND_NAMES.has(commandName);
}

export function validateCommandOverride(commandName: string, input: CommandOverrideInput): { ok: true } | { ok: false; reason: string } {
  if (isEssentialCommand(commandName) && input.enabled === false) {
    return { ok: false, reason: "Essential management commands cannot be disabled." };
  }

  if (input.cooldownSec !== undefined && (!Number.isInteger(input.cooldownSec) || input.cooldownSec < 0 || input.cooldownSec > 3600)) {
    return { ok: false, reason: "Cooldown must be between 0 and 3600 seconds." };
  }

  return { ok: true };
}

export async function getCommandOverrides(guildId: string): Promise<CommandOverride[]> {
  const records = await CommandSettingsModel.find({ guildId }).lean<CommandOverride[]>();
  return records.map((record) => ({
    guildId: record.guildId,
    commandName: record.commandName,
    enabled: record.enabled,
    allowedRoleIds: record.allowedRoleIds ?? [],
    allowedChannelIds: record.allowedChannelIds ?? [],
    cooldownSec: record.cooldownSec ?? 0
  }));
}

export async function getCommandOverride(guildId: string, commandName: string): Promise<CommandOverride | null> {
  const record = await CommandSettingsModel.findOne({ guildId, commandName }).lean<CommandOverride | null>();
  if (!record) {
    return null;
  }

  return {
    guildId: record.guildId,
    commandName: record.commandName,
    enabled: record.enabled,
    allowedRoleIds: record.allowedRoleIds ?? [],
    allowedChannelIds: record.allowedChannelIds ?? [],
    cooldownSec: record.cooldownSec ?? 0
  };
}

export async function upsertCommandOverride(
  guildId: string,
  commandName: string,
  input: CommandOverrideInput
): Promise<CommandOverride> {
  const validation = validateCommandOverride(commandName, input);
  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  const $set: Record<string, unknown> = {
    guildId,
    commandName
  };

  if (input.enabled !== undefined) {
    $set.enabled = input.enabled;
  }
  if (input.allowedRoleIds !== undefined) {
    $set.allowedRoleIds = input.allowedRoleIds;
  }
  if (input.allowedChannelIds !== undefined) {
    $set.allowedChannelIds = input.allowedChannelIds;
  }
  if (input.cooldownSec !== undefined) {
    $set.cooldownSec = input.cooldownSec;
  }
  if (input.updatedById !== undefined) {
    $set.updatedById = input.updatedById;
  }

  const updated = await CommandSettingsModel.findOneAndUpdate(
    { guildId, commandName },
    { $set, $setOnInsert: { enabled: true, allowedRoleIds: [], allowedChannelIds: [], cooldownSec: 0 } },
    { new: true, upsert: true }
  ).lean<CommandOverride | null>();

  if (!updated) {
    throw new Error("Failed to save command settings.");
  }

  return {
    guildId: updated.guildId,
    commandName: updated.commandName,
    enabled: updated.enabled,
    allowedRoleIds: updated.allowedRoleIds ?? [],
    allowedChannelIds: updated.allowedChannelIds ?? [],
    cooldownSec: updated.cooldownSec ?? 0
  };
}

export function evaluateCommandOverride(input: {
  override: CommandOverride | null;
  commandName: string;
  member: GuildMember;
  channelId?: string | null;
}): { ok: true; cooldownSec?: number } | { ok: false; reason: string } {
  const override = input.override;
  if (!override) {
    return { ok: true };
  }

  if (override.enabled === false && !isEssentialCommand(input.commandName)) {
    return { ok: false, reason: "This command is disabled on this server." };
  }

  if (override.allowedChannelIds.length > 0 && (!input.channelId || !override.allowedChannelIds.includes(input.channelId))) {
    return { ok: false, reason: "This command is not allowed in this channel." };
  }

  if (
    override.allowedRoleIds.length > 0 &&
    !input.member.permissions.has("Administrator") &&
    !override.allowedRoleIds.some((roleId) => input.member.roles.cache.has(roleId))
  ) {
    return { ok: false, reason: "You do not have a role allowed to use this command." };
  }

  return { ok: true, cooldownSec: override.cooldownSec };
}
