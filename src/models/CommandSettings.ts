import { model, Schema, type Document } from "mongoose";

export interface CommandSettingsDocument extends Document {
  guildId: string;
  commandName: string;
  enabled: boolean;
  allowedRoleIds: string[];
  allowedChannelIds: string[];
  cooldownSec: number;
  updatedById?: string;
  updatedAt: Date;
}

const commandSettingsSchema = new Schema<CommandSettingsDocument>(
  {
    guildId: { type: String, required: true, index: true },
    commandName: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    allowedRoleIds: { type: [String], default: [] },
    allowedChannelIds: { type: [String], default: [] },
    cooldownSec: { type: Number, default: 0, min: 0, max: 3600 },
    updatedById: { type: String }
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

commandSettingsSchema.index({ guildId: 1, commandName: 1 }, { unique: true });

export const CommandSettingsModel = model<CommandSettingsDocument>("CommandSettings", commandSettingsSchema);
