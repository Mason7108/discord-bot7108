import { model, Schema, type Document } from "mongoose";

export type BotPresenceStatus = "online" | "idle" | "dnd" | "invisible";
export type BotActivityKind = "playing" | "listening" | "watching" | "competing";

export interface BotControlSettingsDocument extends Document {
  key: "global";
  presenceStatus: BotPresenceStatus;
  activityType: BotActivityKind;
  activityText: string;
  updatedById?: string;
  updatedAt: Date;
}

const botControlSettingsSchema = new Schema<BotControlSettingsDocument>(
  {
    key: { type: String, required: true, default: "global", unique: true },
    presenceStatus: {
      type: String,
      enum: ["online", "idle", "dnd", "invisible"],
      default: "online"
    },
    activityType: {
      type: String,
      enum: ["playing", "listening", "watching", "competing"],
      default: "playing"
    },
    activityText: { type: String, default: "", maxlength: 128 },
    updatedById: { type: String }
  },
  { timestamps: { createdAt: false, updatedAt: true }, minimize: false }
);

export const BotControlSettingsModel = model<BotControlSettingsDocument>("BotControlSettings", botControlSettingsSchema);
