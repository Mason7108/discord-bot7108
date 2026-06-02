import { TermsAgreementModel } from "../../models/TermsAgreement.js";

export const TERMS_VERSION = "2026-06-01";
export const TERMS_CONTACT_EMAIL = "mason7108officialbusinessemail@gmail.com";
export const TERMS_COPYRIGHT_NOTICE =
  "Copyright © 2026 by Mason7108 Apps. All Rights Reserved. bot7108™ is a trademark of Mason7108 Apps.";
export const TERMS_AGREEMENT_CHANNEL_ID = "1511227468873465856";
export const TERMS_REQUIRED_MESSAGE =
  "You must agree to the bot7108 Terms of Service and Privacy Policy before using commands. Please go to <#1511227468873465856> to agree.";

const DISCORD_ID_PATTERN = /^\d{17,20}$/;

export function isDiscordId(value: string | undefined): value is string {
  return typeof value === "string" && DISCORD_ID_PATTERN.test(value);
}

export interface AcceptedTermsAgreement {
  acceptedAt: Date;
  termsVersion: string;
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 11000;
}

export async function getAcceptedTermsAgreement(guildId: string, userId: string): Promise<AcceptedTermsAgreement | null> {
  if (!isDiscordId(guildId) || !isDiscordId(userId)) {
    return null;
  }

  const agreement = await TermsAgreementModel.findOne({
    guildId,
    userId,
    accepted: true,
    termsVersion: TERMS_VERSION
  }).lean<{ acceptedAt?: Date; termsVersion?: string } | null>();

  if (!agreement?.acceptedAt || !agreement.termsVersion) {
    return null;
  }

  return {
    acceptedAt: agreement.acceptedAt,
    termsVersion: agreement.termsVersion
  };
}

export async function hasAcceptedTerms(guildId: string, userId: string): Promise<boolean> {
  return (await getAcceptedTermsAgreement(guildId, userId)) !== null;
}

export async function recordTermsAgreement(input: { guildId: string; userId: string }): Promise<{ created: boolean; acceptedAt: Date }> {
  if (!isDiscordId(input.guildId) || !isDiscordId(input.userId)) {
    throw new Error("Invalid Discord user or guild ID.");
  }

  const existing = await getAcceptedTermsAgreement(input.guildId, input.userId);
  if (existing) {
    return { created: false, acceptedAt: existing.acceptedAt };
  }

  const acceptedAt = new Date();
  const existingRecord = await TermsAgreementModel.findOne({
    guildId: input.guildId,
    userId: input.userId,
    termsVersion: TERMS_VERSION
  });

  if (existingRecord) {
    existingRecord.accepted = true;
    existingRecord.acceptedAt = acceptedAt;
    await existingRecord.save();
    return { created: true, acceptedAt };
  }

  try {
    await TermsAgreementModel.create({
      guildId: input.guildId,
      userId: input.userId,
      accepted: true,
      acceptedAt,
      termsVersion: TERMS_VERSION
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const duplicate = await getAcceptedTermsAgreement(input.guildId, input.userId);
      if (duplicate) {
        return { created: false, acceptedAt: duplicate.acceptedAt };
      }
    }

    throw error;
  }

  return { created: true, acceptedAt };
}
