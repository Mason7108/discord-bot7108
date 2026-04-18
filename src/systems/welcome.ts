import { ChannelType, EmbedBuilder, type GuildMember, type TextChannel } from "discord.js";
import type { Env } from "../config/env.js";
import { logger } from "../utils/logger.js";

async function resolveWelcomeChannel(member: GuildMember, env: Env): Promise<TextChannel | null> {
  if (!env.WELCOME_CHANNEL_ID) {
    logger.error({ guildId: member.guild.id }, "Welcome system is enabled but WELCOME_CHANNEL_ID is not configured");
    return null;
  }

  const cached = member.guild.channels.cache.get(env.WELCOME_CHANNEL_ID);
  const channel = cached ?? (await member.guild.channels.fetch(env.WELCOME_CHANNEL_ID).catch(() => null));

  if (!channel || channel.type !== ChannelType.GuildText) {
    logger.error(
      { guildId: member.guild.id, welcomeChannelId: env.WELCOME_CHANNEL_ID },
      "Welcome channel not found or not a text channel"
    );
    return null;
  }

  return channel as TextChannel;
}

export async function sendWelcomeMessage(member: GuildMember, env: Env): Promise<void> {
  if (member.user.bot) {
    return;
  }

  const channel = await resolveWelcomeChannel(member, env);
  if (!channel) {
    return;
  }

  // The guild member count at join-time provides the member position card value.
  const memberNumber = member.guild.memberCount;

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`Welcome ${member}`)
    .setDescription(`You are **Member #${memberNumber}**.\nWelcome to **${member.guild.name}**!`)
    .setThumbnail(member.user.displayAvatarURL({ size: 512 }))
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch((error) => {
    logger.error({ err: error, guildId: member.guild.id, userId: member.id }, "Failed to send welcome message");
  });
}
