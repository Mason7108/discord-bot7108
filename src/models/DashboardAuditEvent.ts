import { model, Schema, type Document } from "mongoose";

export interface DashboardAuditEventDocument extends Document {
  guildId: string;
  actorUserId: string;
  actorDisplayName: string;
  action: string;
  targetType: string;
  targetId?: string;
  settingPath?: string;
  previousValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const dashboardAuditEventSchema = new Schema<DashboardAuditEventDocument>(
  {
    guildId: { type: String, required: true, index: true },
    actorUserId: { type: String, required: true, index: true },
    actorDisplayName: { type: String, required: true },
    action: { type: String, required: true, index: true },
    targetType: { type: String, required: true },
    targetId: { type: String },
    settingPath: { type: String },
    previousValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
    metadata: { type: Schema.Types.Mixed }
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false }
);

dashboardAuditEventSchema.index({ guildId: 1, createdAt: -1 });
dashboardAuditEventSchema.index({ actorUserId: 1, createdAt: -1 });

export const DashboardAuditEventModel = model<DashboardAuditEventDocument>("DashboardAuditEvent", dashboardAuditEventSchema);
