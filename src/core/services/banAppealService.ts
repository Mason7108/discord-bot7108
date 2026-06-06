import { BanAppealRecordModel } from "../../models/BanAppealRecord.js";
import type { AppealAnswers, AppealStatus, BanAppealRecordShape } from "../types.js";

export interface RecordBanInput {
  userId: string;
  username?: string;
  userTag?: string;
  mainGuildId: string;
  appealGuildId: string;
  bannedAt: Date;
  bannedById?: string;
  banReason?: string;
  isPermanentBan: boolean;
}

export interface ReviewAppealInput {
  mainGuildId: string;
  userId: string;
  status: Extract<AppealStatus, "approved" | "denied">;
  reviewedById: string;
  reviewReason: string;
}

export function inferPermanentBanFromReason(reason?: string): boolean {
  if (!reason) {
    return false;
  }

  return /\b(permanent|permaban|perm ban|no appeal|appeals? locked)\b/i.test(reason);
}

export function buildAppealText(answers: AppealAnswers): string {
  return [
    `Why were you banned?\n${answers.bannedReason}`,
    `Why should we unban you?\n${answers.unbanReason}`,
    `What will you do differently?\n${answers.futureChanges}`
  ].join("\n\n");
}

export async function recordBan(input: RecordBanInput): Promise<BanAppealRecordShape> {
  const appealStatus: AppealStatus = input.isPermanentBan ? "locked" : "not_submitted";
  const record = await BanAppealRecordModel.findOneAndUpdate(
    { mainGuildId: input.mainGuildId, userId: input.userId },
    {
      $set: {
        userId: input.userId,
        username: input.username,
        userTag: input.userTag,
        mainGuildId: input.mainGuildId,
        appealGuildId: input.appealGuildId,
        bannedAt: input.bannedAt,
        bannedById: input.bannedById,
        banReason: input.banReason,
        isPermanentBan: input.isPermanentBan,
        appealStatus
      },
      $unset: {
        appealText: "",
        appealAnswers: "",
        appealSubmittedAt: "",
        reviewChannelId: "",
        reviewMessageId: "",
        reviewedById: "",
        reviewReason: "",
        reviewedAt: ""
      }
    },
    { new: true, upsert: true }
  ).lean<BanAppealRecordShape | null>();

  if (!record) {
    throw new Error("Failed to save ban appeal record.");
  }

  return record;
}

export async function findBanAppealRecord(
  mainGuildId: string,
  userId: string
): Promise<BanAppealRecordShape | null> {
  return BanAppealRecordModel.findOne({ mainGuildId, userId }).lean<BanAppealRecordShape | null>();
}

export async function findBanAppealRecordForAppealGuild(
  appealGuildId: string,
  userId: string
): Promise<BanAppealRecordShape | null> {
  return BanAppealRecordModel.findOne({ appealGuildId, userId }).lean<BanAppealRecordShape | null>();
}

export async function submitAppeal(
  mainGuildId: string,
  userId: string,
  answers: AppealAnswers
): Promise<BanAppealRecordShape | null> {
  const record = await BanAppealRecordModel.findOneAndUpdate(
    {
      mainGuildId,
      userId,
      isPermanentBan: false,
      appealStatus: "not_submitted"
    },
    {
      $set: {
        appealStatus: "submitted",
        appealAnswers: answers,
        appealText: buildAppealText(answers),
        appealSubmittedAt: new Date()
      },
      $unset: {
        reviewedById: "",
        reviewReason: "",
        reviewedAt: ""
      }
    },
    { new: true }
  ).lean<BanAppealRecordShape | null>();

  return record;
}

export async function saveAppealReviewMessage(
  mainGuildId: string,
  userId: string,
  reviewChannelId: string,
  reviewMessageId: string
): Promise<void> {
  await BanAppealRecordModel.updateOne(
    { mainGuildId, userId },
    {
      $set: {
        reviewChannelId,
        reviewMessageId
      }
    }
  );
}

export async function setPermanentBanStatus(
  mainGuildId: string,
  userId: string,
  isPermanentBan: boolean,
  reviewedById?: string,
  reviewReason?: string
): Promise<BanAppealRecordShape | null> {
  const existing = await BanAppealRecordModel.findOne({ mainGuildId, userId }).lean<BanAppealRecordShape | null>();
  if (!existing) {
    return null;
  }

  const nextStatus: AppealStatus = isPermanentBan
    ? "locked"
    : existing.appealStatus === "locked"
      ? "not_submitted"
      : existing.appealStatus;

  const update: Record<string, unknown> = {
      $set: {
        isPermanentBan,
        appealStatus: nextStatus
      }
    };

  if (reviewedById || reviewReason) {
    (update.$set as Record<string, unknown>).reviewedById = reviewedById;
    (update.$set as Record<string, unknown>).reviewReason = reviewReason;
    (update.$set as Record<string, unknown>).reviewedAt = new Date();
  }

  return BanAppealRecordModel.findOneAndUpdate(
    { mainGuildId, userId },
    update,
    { new: true }
  ).lean<BanAppealRecordShape | null>();
}

export async function reviewAppeal(input: ReviewAppealInput): Promise<BanAppealRecordShape | null> {
  return BanAppealRecordModel.findOneAndUpdate(
    {
      mainGuildId: input.mainGuildId,
      userId: input.userId,
      appealStatus: "submitted"
    },
    {
      $set: {
        appealStatus: input.status,
        reviewedById: input.reviewedById,
        reviewReason: input.reviewReason,
        reviewedAt: new Date()
      }
    },
    { new: true }
  ).lean<BanAppealRecordShape | null>();
}
