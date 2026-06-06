import { model, Schema, type Document } from "mongoose";
import type { BanAppealRecordShape } from "../core/types.js";

export interface BanAppealRecordDocument extends Document, BanAppealRecordShape {}

const appealAnswersSchema = new Schema(
  {
    bannedReason: { type: String, required: true },
    unbanReason: { type: String, required: true },
    futureChanges: { type: String, required: true }
  },
  { _id: false }
);

const banAppealRecordSchema = new Schema<BanAppealRecordDocument>(
  {
    userId: { type: String, required: true, index: true },
    username: { type: String },
    userTag: { type: String },
    mainGuildId: { type: String, required: true, index: true },
    appealGuildId: { type: String, required: true, index: true },
    bannedAt: { type: Date, required: true, default: Date.now },
    bannedById: { type: String },
    banReason: { type: String },
    isPermanentBan: { type: Boolean, required: true, default: false },
    appealStatus: {
      type: String,
      enum: ["locked", "not_submitted", "submitted", "approved", "denied"],
      required: true,
      default: "not_submitted"
    },
    appealText: { type: String },
    appealAnswers: { type: appealAnswersSchema },
    appealSubmittedAt: { type: Date },
    reviewChannelId: { type: String },
    reviewMessageId: { type: String },
    reviewedById: { type: String },
    reviewReason: { type: String },
    reviewedAt: { type: Date }
  },
  { timestamps: true }
);

banAppealRecordSchema.index({ mainGuildId: 1, userId: 1 }, { unique: true });
banAppealRecordSchema.index({ appealGuildId: 1, userId: 1 });
banAppealRecordSchema.index({ appealStatus: 1, appealSubmittedAt: 1 });

export const BanAppealRecordModel = model<BanAppealRecordDocument>("BanAppealRecord", banAppealRecordSchema);
