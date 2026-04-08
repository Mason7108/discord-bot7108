import { model, Schema, type Document } from "mongoose";
import type { UserProfileShape } from "../core/types.js";

interface WarningEntry {
  moderatorId: string;
  reason: string;
  createdAt: Date;
}

export interface UserProfileDocument extends Document, Omit<UserProfileShape, "warnings"> {
  warnings: WarningEntry[];
}

const warningSchema = new Schema<WarningEntry>(
  {
    moderatorId: { type: String, required: true },
    reason: { type: String, required: true },
    createdAt: { type: Date, required: true, default: Date.now }
  },
  { _id: false }
);

const userProfileSchema = new Schema<UserProfileDocument>(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 0 },
    coins: { type: Number, default: 0 },
    inventory: { type: [String], default: [] },
    warnings: { type: [warningSchema], default: [] },
    lastDailyAt: { type: Date },
    lastWorkAt: { type: Date }
  },
  { timestamps: true }
);

userProfileSchema.index({ guildId: 1, userId: 1 }, { unique: true });

export const UserProfileModel = model<UserProfileDocument>("UserProfile", userProfileSchema);
