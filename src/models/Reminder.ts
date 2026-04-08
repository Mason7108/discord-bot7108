import { model, Schema, type Document } from "mongoose";
import type { ReminderShape } from "../core/types.js";

export interface ReminderDocument extends Document, ReminderShape {}

const reminderSchema = new Schema<ReminderDocument>(
  {
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    text: { type: String, required: true },
    dueAt: { type: Date, required: true, index: true },
    delivered: { type: Boolean, default: false, index: true }
  },
  { timestamps: true }
);

reminderSchema.index({ delivered: 1, dueAt: 1 });

export const ReminderModel = model<ReminderDocument>("Reminder", reminderSchema);
