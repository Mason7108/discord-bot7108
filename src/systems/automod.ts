import { EmbedBuilder, type Message } from "discord.js";
import type { GuildSettingsShape } from "../core/types.js";
import { sendModLog } from "./logging.js";

const spamBuckets = new Map<string, number[]>();
const raidBuckets = new Map<string, number[]>();

const DISCORD_INVITE_LINK_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]+(?:[/?#][^\s]*)?/i;

function hasLink(content: string): boolean {
  return /https?:\/\//i.test(content);
}

export function containsDiscordInviteLink(content: string): boolean {
  return DISCORD_INVITE_LINK_REGEX.test(content);
}

export function canPostDiscordInviteLink(authorId: string, guildOwnerId: string, configuredOwnerId?: string): boolean {
  const ownerId = configuredOwnerId?.trim();
  return authorId === (ownerId || guildOwnerId);
}

function hasExcessiveCaps(content: string, maxCapsRatio: number): boolean {
  const letters = content.replace(/[^a-z]/gi, "");
  if (letters.length < 10) {
    return false;
  }

  const caps = letters.replace(/[^A-Z]/g, "").length;
  return caps / letters.length > maxCapsRatio;
}

function containsBlacklistedWord(content: string, words: string[]): string | null {
  const normalized = content.toLowerCase();
  for (const word of words) {
    if (normalized.includes(word.toLowerCase())) {
      return word;
    }
  }
  return null;
}

function isSpamming(bucketKey: string, threshold: number, intervalMs: number): boolean {
  const now = Date.now();
  const entries = spamBuckets.get(bucketKey) ?? [];
  const next = entries.filter((stamp) => now - stamp < intervalMs);
  next.push(now);
  spamBuckets.set(bucketKey, next);
  return next.length >= threshold;
}

function isRaidSpike(guildId: string): boolean {
  const now = Date.now();
  const entries = raidBuckets.get(guildId) ?? [];
  const next = entries.filter((stamp) => now - stamp < 10_000);
  next.push(now);
  raidBuckets.set(guildId, next);
  return next.length > 20;
}

export async function runAutomod(message: Message, settings: GuildSettingsShape): Promise<void> {
  if (!message.guild || !settings.modules.moderation || !settings.automod.enabled) {
    return;
  }

  const content = message.content;
  let violation: string | null = null;
  const botOwnerId = process.env.BOT_OWNER_ID;

  if (
    settings.automod.discordInviteFilter &&
    containsDiscordInviteLink(content) &&
    !canPostDiscordInviteLink(message.author.id, message.guild.ownerId, botOwnerId)
  ) {
    violation = "Discord invite link blocked";
  }

  if (!violation && message.member?.permissions.has("Administrator")) {
    return;
  }

  if (settings.automod.antiSpam) {
    const spamming = isSpamming(
      `${message.guild.id}:${message.author.id}`,
      settings.automod.spamThreshold,
      settings.automod.spamIntervalSec * 1_000
    );
    if (spamming) {
      violation = "Spam detected";
    }
  }

  if (!violation && settings.automod.linkFilter && hasLink(content)) {
    violation = "Link blocked by automod";
  }

  const blacklistedWord = containsBlacklistedWord(content, settings.automod.blacklist);
  if (!violation && blacklistedWord) {
    violation = `Blacklisted word: ${blacklistedWord}`;
  }

  if (!violation && settings.automod.capsFilter && hasExcessiveCaps(content, settings.automod.maxCapsRatio)) {
    violation = "Excessive caps";
  }

  if (!violation && settings.automod.antiRaid && isRaidSpike(message.guild.id)) {
    violation = "Raid spike detected";
  }

  if (!violation) {
    return;
  }

  await message.delete().catch(() => null);

  const embed = new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle("AutoMod Action")
    .setDescription(`A message from ${message.author.tag} was removed.`)
    .addFields(
      { name: "Reason", value: violation },
      { name: "Content", value: content.slice(0, 900) || "(empty)" }
    )
    .setTimestamp();

  await sendModLog(message.guild, settings, embed);
}
