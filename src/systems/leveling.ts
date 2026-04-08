import type { Message } from "discord.js";
import { XP_COOLDOWN_MS } from "../core/constants.js";
import type { GuildSettingsShape } from "../core/types.js";
import { addXp } from "../core/services/userProfileService.js";

const xpCooldowns = new Map<string, number>();

export async function processLevelingMessage(message: Message, settings: GuildSettingsShape): Promise<void> {
  if (!message.guild || message.author.bot || !settings.modules.leveling) {
    return;
  }

  if (message.content.trim().length < 3) {
    return;
  }

  const key = `${message.guild.id}:${message.author.id}`;
  const lastXp = xpCooldowns.get(key) ?? 0;

  if (Date.now() - lastXp < XP_COOLDOWN_MS) {
    return;
  }

  xpCooldowns.set(key, Date.now());

  const awardedXp = 15 + Math.floor(Math.random() * 11);
  const { profile, leveledUp } = await addXp(message.guild.id, message.author.id, awardedXp);

  if (!leveledUp) {
    return;
  }

  const levelRole = settings.levelRoles.find((item) => item.level === profile.level);
  if (levelRole && message.member && !message.member.roles.cache.has(levelRole.roleId)) {
    await message.member.roles.add(levelRole.roleId).catch(() => null);
  }

  if ("send" in message.channel) {
    await message.channel.send({
      content: `${message.author}, you reached level **${profile.level}**!`
    });
  }
}
