import { model, Schema, type Document } from "mongoose";

export type SupportSubmissionKind = "support" | "bug" | "feature";

export interface SupportSubmissionDocument extends Document {
  kind: SupportSubmissionKind;
  name: string;
  contact: string;
  discordUserId?: string;
  guildId?: string;
  subject: string;
  message: string;
  status: "new" | "reviewing" | "closed";
  createdAt: Date;
}

const supportSubmissionSchema = new Schema<SupportSubmissionDocument>(
  {
    kind: { type: String, enum: ["support", "bug", "feature"], required: true, index: true },
    name: { type: String, required: true, maxlength: 80 },
    contact: { type: String, required: true, maxlength: 160 },
    discordUserId: { type: String, index: true },
    guildId: { type: String, index: true },
    subject: { type: String, required: true, maxlength: 120 },
    message: { type: String, required: true, maxlength: 3000 },
    status: { type: String, enum: ["new", "reviewing", "closed"], default: "new", index: true }
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

supportSubmissionSchema.index({ kind: 1, createdAt: -1 });
supportSubmissionSchema.index({ guildId: 1, createdAt: -1 });

export const SupportSubmissionModel = model<SupportSubmissionDocument>("SupportSubmission", supportSubmissionSchema);
