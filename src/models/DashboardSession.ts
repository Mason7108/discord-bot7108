import { model, Schema, type Document } from "mongoose";

export interface DashboardSessionDocument extends Document {
  sessionIdHash: string;
  discordUserId: string;
  username: string;
  displayName?: string;
  avatar?: string;
  encryptedAccessToken: string;
  tokenExpiresAt: Date;
  csrfToken: string;
  csrfTokenHash: string;
  createdAt: Date;
  expiresAt: Date;
}

const dashboardSessionSchema = new Schema<DashboardSessionDocument>(
  {
    sessionIdHash: { type: String, required: true, unique: true, index: true },
    discordUserId: { type: String, required: true, index: true },
    username: { type: String, required: true },
    displayName: { type: String },
    avatar: { type: String },
    encryptedAccessToken: { type: String, required: true },
    tokenExpiresAt: { type: Date, required: true },
    csrfToken: { type: String, required: true },
    csrfTokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

dashboardSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const DashboardSessionModel = model<DashboardSessionDocument>("DashboardSession", dashboardSessionSchema);
