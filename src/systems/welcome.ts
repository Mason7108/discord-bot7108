import { ChannelType, EmbedBuilder, type Guild, type GuildMember, type PartialGuildMember, type Role, type TextChannel, type User } from "discord.js";
import type { Env } from "../config/env.js";
import type { GuildSettingsShape, WelcomeSettings } from "../core/types.js";
import { logger } from "../utils/logger.js";

type WelcomeMember = GuildMember | PartialGuildMember;

async function resolveTextChannel(guild: Guild, channelId: string | undefined, context: string): Promise<TextChannel | null> {
  if (!channelId) {
    logger.error({ guildId: guild.id, context }, "Welcome system channel is not configured");
    return null;
  }

  const cached = guild.channels.cache.get(channelId);
  const channel = cached ?? (await guild.channels.fetch(channelId).catch(() => null));

  if (!channel || channel.type !== ChannelType.GuildText) {
    logger.error(
      { guildId: guild.id, channelId, context },
      "Welcome system channel not found or not a text channel"
    );
    return null;
  }

  return channel as TextChannel;
}

function resolveLegacyWelcomeSettings(env: Env): WelcomeSettings {
  return {
    enabled: Boolean(env.WELCOME_CHANNEL_ID),
    channelId: env.WELCOME_CHANNEL_ID,
    message: "Welcome {user} to {server}",
    goodbyeEnabled: false,
    goodbyeMessage: "{username} left {server}.",
    dmEnabled: false,
    dmMessage: "Welcome to {server}, {username}.",
    roleId: undefined
  };
}

function renderTemplate(template: string, input: { user: User; guild: Guild; memberCount?: number }): string {
  const username = input.user.globalName ?? input.user.username;
  return template
    .replaceAll("{user}", `<@${input.user.id}>`)
    .replaceAll("{username}", username)
    .replaceAll("{server}", input.guild.name)
    .replaceAll("{memberCount}", String(input.memberCount ?? input.guild.memberCount));
}

async function assignWelcomeRole(member: GuildMember, roleId: string | undefined): Promise<void> {
  if (!roleId) {
    return;
  }

  const botMember = member.guild.members.me ?? (await member.guild.members.fetchMe().catch(() => null));
  const role: Role | null = member.guild.roles.cache.get(roleId) ?? null;
  if (!botMember || !role || role.id === member.guild.roles.everyone.id || role.position >= botMember.roles.highest.position) {
    logger.warn({ guildId: member.guild.id, roleId }, "Cannot assign welcome role due to role hierarchy or missing role");
    return;
  }

  await member.roles.add(role.id, "bot7108 welcome role assignment").catch((error) => {
    logger.warn({ err: error, guildId: member.guild.id, roleId, userId: member.id }, "Failed to assign welcome role");
  });
}

export async function sendWelcomeMessage(member: GuildMember, env: Env, settings?: GuildSettingsShape): Promise<void> {
  if (member.user.bot) {
    return;
  }

  const welcome = settings?.welcome ?? resolveLegacyWelcomeSettings(env);
  if (!welcome.enabled) {
    return;
  }

  await assignWelcomeRole(member, welcome.roleId);

  const channel = await resolveTextChannel(member.guild, welcome.channelId, "welcome");
  if (!channel) {
    return;
  }

  const usernameLabel = member.user.globalName ?? member.user.username;
  const avatarUrl = member.user.displayAvatarURL({ size: 512 });
  const description = renderTemplate(welcome.message, {
    user: member.user,
    guild: member.guild,
    memberCount: member.guild.memberCount
  });

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(`Welcome @${usernameLabel}`)
    .setDescription(`### Member #${member.guild.memberCount}`)
    .setThumbnail(avatarUrl)
    .setTimestamp();

  await channel.send({ content: description, embeds: [embed], allowedMentions: { users: [member.id], roles: [] } }).catch((error) => {
    logger.error({ err: error, guildId: member.guild.id, userId: member.id }, "Failed to send welcome message");
  });

  if (welcome.dmEnabled) {
    const dmMessage = renderTemplate(welcome.dmMessage, {
      user: member.user,
      guild: member.guild,
      memberCount: member.guild.memberCount
    });
    await member.send({ content: dmMessage, allowedMentions: { users: [], roles: [] } }).catch(() => null);
  }
}

export async function sendGoodbyeMessage(member: WelcomeMember, settings: GuildSettingsShape): Promise<void> {
  const user = member.user;
  if (!user || user.bot || !settings.welcome.goodbyeEnabled) {
    return;
  }

  const channel = await resolveTextChannel(member.guild, settings.welcome.goodbyeChannelId ?? settings.welcome.channelId, "goodbye");
  if (!channel) {
    return;
  }

  const message = renderTemplate(settings.welcome.goodbyeMessage, {
    user,
    guild: member.guild,
    memberCount: member.guild.memberCount
  });

  await channel.send({ content: message, allowedMentions: { users: [], roles: [] } }).catch((error) => {
    logger.error({ err: error, guildId: member.guild.id, userId: user.id }, "Failed to send goodbye message");
  });
}
