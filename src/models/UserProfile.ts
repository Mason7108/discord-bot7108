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
    bankSavings: { type: Number, default: 0 },
    activeLoanBalance: { type: Number, default: 0 },
    activeLoanOriginalAmount: { type: Number, default: 0 },
    activeLoanTotalOwed: { type: Number, default: 0 },
    loanInterestRate: { type: Number, default: 0.1 },
    loanNextPaymentDueAt: { type: Date },
    totalLoanPaidBack: { type: Number, default: 0 },
    trustScore: { type: Number, default: 50 },
    bankAccountCreatedAt: { type: Date, default: Date.now },
    inventory: { type: [String], default: [] },
    warnings: { type: [warningSchema], default: [] },
    hasVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date },
    lastDailyAt: { type: Date },
    lastWorkAt: { type: Date }
  },
  { timestamps: true }
);

userProfileSchema.index({ guildId: 1, userId: 1 }, { unique: true });

export const UserProfileModel = model<UserProfileDocument>("UserProfile", userProfileSchema);
