import { CommandRestrictionModel } from "../../models/CommandRestriction.js";
import type { CommandRestrictionShape } from "../types.js";

export interface RestrictUserCommandsInput {
  guildId: string;
  userId: string;
  restrictedById: string;
  reason: string;
  expiresAt?: Date;
}

export function isCommandRestrictionActive(restriction: Pick<CommandRestrictionShape, "expiresAt">, now = new Date()): boolean {
  return !restriction.expiresAt || restriction.expiresAt.getTime() > now.getTime();
}

export async function getActiveCommandRestriction(
  guildId: string,
  userId: string,
  now = new Date()
): Promise<CommandRestrictionShape | null> {
  const restriction = await CommandRestrictionModel.findOne({ guildId, userId }).lean<CommandRestrictionShape | null>();

  if (!restriction) {
    return null;
  }

  if (!isCommandRestrictionActive(restriction, now)) {
    await CommandRestrictionModel.deleteOne({ guildId, userId });
    return null;
  }

  return restriction;
}

export async function restrictUserCommands(input: RestrictUserCommandsInput): Promise<CommandRestrictionShape> {
  const reason = input.reason.trim() || "No reason provided";
  const update: Record<string, unknown> = {
    $set: {
      guildId: input.guildId,
      userId: input.userId,
      restrictedById: input.restrictedById,
      reason,
      restrictedAt: new Date()
    }
  };

  if (input.expiresAt) {
    (update.$set as Record<string, unknown>).expiresAt = input.expiresAt;
  } else {
    update.$unset = { expiresAt: "" };
  }

  const restriction = await CommandRestrictionModel.findOneAndUpdate({ guildId: input.guildId, userId: input.userId }, update, {
    new: true,
    upsert: true
  }).lean<CommandRestrictionShape | null>();

  if (!restriction) {
    throw new Error("Failed to save command restriction.");
  }

  return restriction;
}

export async function removeCommandRestriction(guildId: string, userId: string): Promise<boolean> {
  const result = await CommandRestrictionModel.deleteOne({ guildId, userId });
  return result.deletedCount > 0;
}
