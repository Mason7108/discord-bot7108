import { model, Schema, type Document } from "mongoose";
import type { CommandRestrictionShape } from "../core/types.js";

export interface CommandRestrictionDocument extends Document, CommandRestrictionShape {}

const commandRestrictionSchema = new Schema<CommandRestrictionDocument>(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    restrictedById: { type: String, required: true },
    reason: { type: String, required: true, default: "No reason provided" },
    restrictedAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date }
  },
  { timestamps: true }
);

commandRestrictionSchema.index({ guildId: 1, userId: 1 }, { unique: true });
commandRestrictionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const CommandRestrictionModel = model<CommandRestrictionDocument>("CommandRestriction", commandRestrictionSchema);
