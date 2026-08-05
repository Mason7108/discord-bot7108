import { model, Schema, type Document } from "mongoose";

export type DashboardModerationAction =
  | "warn"
  | "remove_warning"
  | "timeout"
  | "untimeout"
  | "kick"
  | "ban"
  | "unban"
  | "purge"
  | "lock"
  | "unlock"
  | "slowmode";

export interface ModerationCaseDocument extends Document {
  guildId: string;
  caseNumber: number;
  action: DashboardModerationAction;
  targetUserId?: string;
  targetTag?: string;
  moderatorUserId: string;
  moderatorTag: string;
  reason: string;
  notes?: string;
  channelId?: string;
  durationSeconds?: number;
  messageCount?: number;
  createdAt: Date;
}

const moderationCaseSchema = new Schema<ModerationCaseDocument>(
  {
    guildId: { type: String, required: true, index: true },
    caseNumber: { type: Number, required: true },
    action: {
      type: String,
      required: true,
      enum: ["warn", "remove_warning", "timeout", "untimeout", "kick", "ban", "unban", "purge", "lock", "unlock", "slowmode"],
      index: true
    },
    targetUserId: { type: String, index: true },
    targetTag: { type: String },
    moderatorUserId: { type: String, required: true, index: true },
    moderatorTag: { type: String, required: true },
    reason: { type: String, required: true },
    notes: { type: String },
    channelId: { type: String, index: true },
    durationSeconds: { type: Number },
    messageCount: { type: Number }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

moderationCaseSchema.index({ guildId: 1, caseNumber: 1 }, { unique: true });
moderationCaseSchema.index({ guildId: 1, createdAt: -1 });

export const ModerationCaseModel = model<ModerationCaseDocument>("ModerationCase", moderationCaseSchema);
