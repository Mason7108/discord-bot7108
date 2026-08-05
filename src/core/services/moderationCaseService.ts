import { ModerationCaseModel, type DashboardModerationAction } from "../../models/ModerationCase.js";

export async function createModerationCase(input: {
  guildId: string;
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
}) {
  const latest = await ModerationCaseModel.findOne({ guildId: input.guildId })
    .sort({ caseNumber: -1 })
    .select({ caseNumber: 1 })
    .lean<{ caseNumber: number } | null>();

  return ModerationCaseModel.create({
    ...input,
    caseNumber: (latest?.caseNumber ?? 0) + 1
  });
}
