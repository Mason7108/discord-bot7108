import { model, Schema, type Document } from "mongoose";

export interface TermsAgreementDocument extends Document {
  guildId: string;
  userId: string;
  accepted: boolean;
  acceptedAt: Date;
  termsVersion: string;
}

const termsAgreementSchema = new Schema<TermsAgreementDocument>(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    accepted: { type: Boolean, required: true, default: true },
    acceptedAt: { type: Date, required: true, default: Date.now },
    termsVersion: { type: String, required: true, index: true }
  },
  { timestamps: true }
);

termsAgreementSchema.index({ guildId: 1, userId: 1, termsVersion: 1 }, { unique: true });

export const TermsAgreementModel = model<TermsAgreementDocument>("TermsAgreement", termsAgreementSchema);
