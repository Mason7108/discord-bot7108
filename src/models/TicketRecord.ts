import { model, Schema, type Document } from "mongoose";
import type { TicketRecordShape } from "../core/types.js";

export interface TicketRecordDocument extends Document, TicketRecordShape {}

const ticketRecordSchema = new Schema<TicketRecordDocument>(
  {
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true, unique: true },
    ownerId: { type: String, required: true, index: true },
    status: { type: String, enum: ["open", "closed"], default: "open", index: true },
    claimedById: { type: String },
    createdAt: { type: Date, default: Date.now },
    closedAt: { type: Date },
    transcriptUrl: { type: String }
  },
  { timestamps: true }
);

ticketRecordSchema.index({ guildId: 1, status: 1, createdAt: -1 });

export const TicketRecordModel = model<TicketRecordDocument>("TicketRecord", ticketRecordSchema);
