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

export async function hasAcceptedTerms(guildId: string, userId: string): Promise<boolean> {
  if (!isDiscordId(guildId) || !isDiscordId(userId)) {
    return false;
  }

  const agreement = await TermsAgreementModel.findOne({
    guildId,
    userId,
    accepted: true,
    termsVersion: TERMS_VERSION
  }).lean<{ accepted?: boolean } | null>();

  return agreement?.accepted === true;
}

export async function recordTermsAgreement(input: { guildId: string; userId: string }): Promise<void> {
  if (!isDiscordId(input.guildId) || !isDiscordId(input.userId)) {
    throw new Error("Invalid Discord user or guild ID.");
  }

  await TermsAgreementModel.findOneAndUpdate(
    {
      guildId: input.guildId,
      userId: input.userId,
      termsVersion: TERMS_VERSION
    },
    {
      $setOnInsert: {
        guildId: input.guildId,
        userId: input.userId,
        termsVersion: TERMS_VERSION
      },
      $set: {
        accepted: true,
        acceptedAt: new Date()
      }
    },
    { upsert: true }
  );
}
