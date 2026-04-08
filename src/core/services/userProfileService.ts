import mongoose from "mongoose";
import { UserProfileModel } from "../../models/UserProfile.js";
import { randomInt } from "../../utils/math.js";

const DAILY_COINS = 250;
const WORK_MIN = 100;
const WORK_MAX = 280;
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1_000;
const WORK_COOLDOWN_MS = 60 * 60 * 1_000;

export function xpToLevel(xp: number): number {
  return Math.floor(0.1 * Math.sqrt(xp));
}

export async function getOrCreateProfile(guildId: string, userId: string) {
  const existing = await UserProfileModel.findOne({ guildId, userId });
  if (existing) {
    return existing;
  }

  return UserProfileModel.create({ guildId, userId });
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
  const profile = await getOrCreateProfile(guildId, userId);
  profile.coins += amount;
  await profile.save();
  return profile;
}

export async function removeCoins(guildId: string, userId: string, amount: number) {
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
