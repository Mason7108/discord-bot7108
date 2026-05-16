import mongoose from "mongoose";
import { UserProfileModel } from "../../models/UserProfile.js";
import { randomInt } from "../../utils/math.js";

const DAILY_COINS = 250;
const WORK_MIN = 100;
const WORK_MAX = 280;
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1_000;
const WORK_COOLDOWN_MS = 60 * 60 * 1_000;
const LOAN_INTEREST_RATE = 0.1;
const LOAN_PAYMENT_INTERVAL_MS = 3 * 24 * 60 * 60 * 1_000;
const TRUST_MIN = 0;
const TRUST_MAX = 100;
const TRUST_REWARD_ON_TIME = 1;
const TRUST_REWARD_LOAN_CLEARED = 2;
const TRUST_PENALTY_MISSED_PAYMENT = 3;
const BASE_LOAN_LIMIT = 500;
const LOAN_LIMIT_PER_TRUST_POINT = 30;

export function xpToLevel(xp: number): number {
  return Math.floor(0.1 * Math.sqrt(xp));
}

function clampTrustScore(value: number): number {
  return Math.max(TRUST_MIN, Math.min(TRUST_MAX, Math.round(value)));
}

function validateWholePositiveAmount(amount: number, label: string): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`${label} must be a whole number greater than 0.`);
  }
}

function ensureBankProfileDefaults(profile: any): boolean {
  let changed = false;
  const setDefault = (key: string, value: any) => {
    if (profile[key] === undefined || profile[key] === null) {
      profile[key] = value;
      changed = true;
    }
  };

  setDefault("bankSavings", 0);
  setDefault("activeLoanBalance", 0);
  setDefault("activeLoanOriginalAmount", 0);
  setDefault("activeLoanTotalOwed", 0);
  setDefault("loanInterestRate", LOAN_INTEREST_RATE);
  setDefault("totalLoanPaidBack", 0);
  setDefault("trustScore", 50);
  setDefault("bankAccountCreatedAt", new Date());

  const normalizedTrust = clampTrustScore(profile.trustScore);
  if (normalizedTrust !== profile.trustScore) {
    profile.trustScore = normalizedTrust;
    changed = true;
  }

  if (profile.activeLoanBalance <= 0 && profile.loanNextPaymentDueAt) {
    profile.loanNextPaymentDueAt = undefined;
    changed = true;
  }

  return changed;
}

function applyLoanDelinquencyAdjustments(profile: any, now = Date.now()): boolean {
  if (profile.activeLoanBalance <= 0 || !profile.loanNextPaymentDueAt) {
    return false;
  }

  let changed = false;
  let trustScore = clampTrustScore(profile.trustScore);
  let nextDue = new Date(profile.loanNextPaymentDueAt);
  let guard = 0;

  while (nextDue.getTime() <= now && guard < 24 && profile.activeLoanBalance > 0) {
    trustScore = clampTrustScore(trustScore - TRUST_PENALTY_MISSED_PAYMENT);
    nextDue = new Date(nextDue.getTime() + LOAN_PAYMENT_INTERVAL_MS);
    changed = true;
    guard += 1;
  }

  if (changed) {
    profile.trustScore = trustScore;
    profile.loanNextPaymentDueAt = nextDue;
  }

  return changed;
}

export function calculateLoanTotalOwed(amount: number, interestRate = LOAN_INTEREST_RATE): number {
  return Math.round(amount * (1 + interestRate));
}

export function getLoanLimitForTrustScore(trustScore: number): number {
  const clamped = clampTrustScore(trustScore);
  return BASE_LOAN_LIMIT + clamped * LOAN_LIMIT_PER_TRUST_POINT;
}

export async function getOrCreateProfile(guildId: string, userId: string) {
  const existing = await UserProfileModel.findOne({ guildId, userId });
  if (existing) {
    const changed = ensureBankProfileDefaults(existing) || applyLoanDelinquencyAdjustments(existing);
    if (changed) {
      await existing.save();
    }
    return existing;
  }

  const created = await UserProfileModel.create({ guildId, userId });
  ensureBankProfileDefaults(created);
  await created.save();
  return created;
}

export async function addXp(guildId: string, userId: string, amount: number) {
  const profile = await getOrCreateProfile(guildId, userId);
  profile.xp += amount;
  const nextLevel = xpToLevel(profile.xp);
  const leveledUp = nextLevel > profile.level;

  if (leveledUp) {
    profile.level = nextLevel;
  }

  await profile.save();
  return { profile, leveledUp };
}

export async function claimDaily(guildId: string, userId: string) {
  const profile = await getOrCreateProfile(guildId, userId);
  const now = Date.now();

  if (profile.lastDailyAt && now - profile.lastDailyAt.getTime() < DAILY_COOLDOWN_MS) {
    const msRemaining = DAILY_COOLDOWN_MS - (now - profile.lastDailyAt.getTime());
    return { ok: false as const, msRemaining };
  }

  profile.coins += DAILY_COINS;
  profile.lastDailyAt = new Date(now);
  await profile.save();

  return { ok: true as const, awarded: DAILY_COINS, balance: profile.coins };
}

export async function claimWork(guildId: string, userId: string) {
  const profile = await getOrCreateProfile(guildId, userId);
  const now = Date.now();

  if (profile.lastWorkAt && now - profile.lastWorkAt.getTime() < WORK_COOLDOWN_MS) {
    const msRemaining = WORK_COOLDOWN_MS - (now - profile.lastWorkAt.getTime());
    return { ok: false as const, msRemaining };
  }

  const awarded = randomInt(WORK_MIN, WORK_MAX);
  profile.coins += awarded;
  profile.lastWorkAt = new Date(now);
  await profile.save();

  return { ok: true as const, awarded, balance: profile.coins };
}

export async function transferCoinsAtomic(guildId: string, fromUserId: string, toUserId: string, amount: number) {
  if (fromUserId === toUserId) {
    throw new Error("You cannot pay yourself.");
  }

  const session = await mongoose.startSession();
  try {
    let fromBalance = 0;
    let toBalance = 0;

    await session.withTransaction(async () => {
      let fromProfile = await UserProfileModel.findOne({ guildId, userId: fromUserId }).session(session);
      let toProfile = await UserProfileModel.findOne({ guildId, userId: toUserId }).session(session);

      if (!fromProfile) {
        fromProfile = new UserProfileModel({ guildId, userId: fromUserId });
        await fromProfile.save({ session });
      }

      if (!toProfile) {
        toProfile = new UserProfileModel({ guildId, userId: toUserId });
        await toProfile.save({ session });
      }

      if (fromProfile.coins < amount) {
        throw new Error("Insufficient balance.");
      }

      fromProfile.coins -= amount;
      toProfile.coins += amount;

      await fromProfile.save({ session });
      await toProfile.save({ session });

      fromBalance = fromProfile.coins;
      toBalance = toProfile.coins;
    });

    return { fromBalance, toBalance };
  } finally {
    session.endSession();
  }
}

export async function addCoins(guildId: string, userId: string, amount: number) {
  validateWholePositiveAmount(amount, "Amount");
  const profile = await getOrCreateProfile(guildId, userId);
  profile.coins += amount;
  await profile.save();
  return profile;
}

export async function removeCoins(guildId: string, userId: string, amount: number) {
  validateWholePositiveAmount(amount, "Amount");
  const profile = await getOrCreateProfile(guildId, userId);
  profile.coins = Math.max(0, profile.coins - amount);
  await profile.save();
  return profile;
}

export async function addItemToInventory(guildId: string, userId: string, item: string) {
  const profile = await getOrCreateProfile(guildId, userId);
  profile.inventory.push(item);
  await profile.save();
  return profile;
}

export async function getTopByCoins(guildId: string, limit = 10) {
  return UserProfileModel.find({ guildId })
    .sort({ coins: -1 })
    .limit(limit)
    .lean();
}

export async function getTopByLevel(guildId: string, limit = 10) {
  return UserProfileModel.find({ guildId })
    .sort({ level: -1, xp: -1 })
    .limit(limit)
    .lean();
}

export async function depositToSavings(guildId: string, userId: string, amount: number) {
  validateWholePositiveAmount(amount, "Deposit amount");
  const profile = await getOrCreateProfile(guildId, userId);

  if (profile.coins < amount) {
    throw new Error("You do not have enough wallet coins for that deposit.");
  }

  profile.coins -= amount;
  profile.bankSavings += amount;
  await profile.save();

  return profile;
}

export async function withdrawFromSavings(guildId: string, userId: string, amount: number) {
  validateWholePositiveAmount(amount, "Withdraw amount");
  const profile = await getOrCreateProfile(guildId, userId);

  if (profile.bankSavings < amount) {
    throw new Error("You do not have enough savings for that withdrawal.");
  }

  profile.bankSavings -= amount;
  profile.coins += amount;
  await profile.save();

  return profile;
}

export async function requestLoan(guildId: string, userId: string, amount: number) {
  validateWholePositiveAmount(amount, "Loan amount");
  const profile = await getOrCreateProfile(guildId, userId);

  if (profile.activeLoanBalance > 0) {
    throw new Error("You already have an active loan. Repay it before taking another.");
  }

  const maxLoan = getLoanLimitForTrustScore(profile.trustScore);
  if (amount > maxLoan) {
    throw new Error(`Loan denied. Your current Trust Score allows up to ${maxLoan} coins.`);
  }

  const totalOwed = calculateLoanTotalOwed(amount, LOAN_INTEREST_RATE);

  profile.coins += amount;
  profile.activeLoanOriginalAmount = amount;
  profile.activeLoanTotalOwed = totalOwed;
  profile.activeLoanBalance = totalOwed;
  profile.loanInterestRate = LOAN_INTEREST_RATE;
  profile.loanNextPaymentDueAt = new Date(Date.now() + LOAN_PAYMENT_INTERVAL_MS);
  await profile.save();

  return { profile, totalOwed };
}

export async function payLoan(guildId: string, userId: string, amount: number) {
  validateWholePositiveAmount(amount, "Payment amount");
  const profile = await getOrCreateProfile(guildId, userId);

  if (profile.activeLoanBalance <= 0) {
    throw new Error("You do not have an active loan.");
  }

  if (profile.coins < amount) {
    throw new Error("You do not have enough wallet coins to make that payment.");
  }

  const payment = Math.min(amount, profile.activeLoanBalance);
  const paidOnTime = profile.loanNextPaymentDueAt ? Date.now() <= profile.loanNextPaymentDueAt.getTime() : true;

  profile.coins -= payment;
  profile.activeLoanBalance -= payment;
  profile.totalLoanPaidBack += payment;

  if (paidOnTime) {
    profile.trustScore = clampTrustScore(profile.trustScore + TRUST_REWARD_ON_TIME);
  }

  if (profile.activeLoanBalance <= 0) {
    profile.activeLoanBalance = 0;
    profile.activeLoanOriginalAmount = 0;
    profile.activeLoanTotalOwed = 0;
    profile.loanNextPaymentDueAt = undefined;
    profile.trustScore = clampTrustScore(profile.trustScore + TRUST_REWARD_LOAN_CLEARED);
  } else {
    profile.loanNextPaymentDueAt = new Date(Date.now() + LOAN_PAYMENT_INTERVAL_MS);
  }

  await profile.save();
  return { profile, payment };
}

export async function resetLoanData(guildId: string, userId: string) {
  const profile = await getOrCreateProfile(guildId, userId);
  profile.activeLoanBalance = 0;
  profile.activeLoanOriginalAmount = 0;
  profile.activeLoanTotalOwed = 0;
  profile.totalLoanPaidBack = 0;
  profile.loanNextPaymentDueAt = undefined;
  await profile.save();
  return profile;
}

export async function adjustTrustScore(guildId: string, userId: string, delta: number) {
  validateWholePositiveAmount(Math.abs(delta), "Trust score adjustment");
  const profile = await getOrCreateProfile(guildId, userId);
  profile.trustScore = clampTrustScore(profile.trustScore + delta);
  await profile.save();
  return profile;
}
