import { model, Schema, type Document } from "mongoose";
import type { GiveawayEntryShape } from "../core/types.js";

export interface GiveawayEntryDocument extends Document, GiveawayEntryShape {}

const giveawayEntrySchema = new Schema<GiveawayEntryDocument>(
  {
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true, index: true },
    prize: { type: String, required: true },
    winnerCount: { type: Number, required: true, min: 1 },
    endsAt: { type: Date, required: true, index: true },
    entrants: { type: [String], default: [] },
    status: { type: String, enum: ["active", "ended", "deleted"], default: "active", index: true },
    winners: { type: [String], default: [] }
  },
  { timestamps: true }
);

giveawayEntrySchema.index({ guildId: 1, status: 1, endsAt: 1 });

export const GiveawayEntryModel = model<GiveawayEntryDocument>("GiveawayEntry", giveawayEntrySchema);
