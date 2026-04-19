import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  type Message,
  type TextChannel
} from "discord.js";
import type { Env } from "../config/env.js";
import type { GuildSettingsShape } from "../core/types.js";
import { logger } from "../utils/logger.js";

function clip(value: string, limit = 1_000): string {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit - 3)}...`;
}

function formatContent(content: string | null | undefined): string {
  const normalized = (content ?? "").trim();
  if (normalized.length === 0) {
    return "No content";
  }

  return clip(normalized);
}

function formatOldContent(content: string | null | undefined): string {
  if (content === null || content === undefined) {
    return "Unknown (message was not cached before edit)";
  }

  return formatContent(content);
}

async function resolveMessageLogChannel(input: {
  message: Message;
  env: Env;
  settings: GuildSettingsShape;
}): Promise<TextChannel | null> {
  const channelId = input.env.MESSAGE_LOG_CHANNEL_ID ?? input.settings.modLogChannelId;
  if (!channelId) {
    logger.error({ guildId: input.message.guildId }, "Message log channel is not configured (set MESSAGE_LOG_CHANNEL_ID)");
    return null;
  }

  const cached = input.message.guild?.channels.cache.get(channelId);
  const channel = cached ?? (await input.message.guild?.channels.fetch(channelId).catch(() => null));

  if (!channel || channel.type !== ChannelType.GuildText) {
    logger.error({ guildId: input.message.guildId, channelId }, "Message log channel not found or not a text channel");
    return null;
  }

  return channel as TextChannel;
}

export async function logDeletedMessage(input: {
  message: Message;
  env: Env;
  settings: GuildSettingsShape;
}): Promise<void> {
  const { message } = input;

  if (message.partial) {
    await message.fetch().catch(() => null);
  }

  if (!message.guild) {
    return;
  }

  if (message.author?.bot) {
    return;
  }

  const channel = await resolveMessageLogChannel(input);
  if (!channel) {
    return;
  }

  const authorTag = message.author?.tag ?? "Unknown User";
  const authorId = message.author?.id ?? "Unknown";
  const deletedContent = formatContent(message.content);

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("Message Deleted")
    .setThumbnail(message.author?.displayAvatarURL({ size: 512 }) ?? null)
    .addFields(
      { name: "User", value: authorTag, inline: true },
      { name: "User ID", value: authorId, inline: true },
      { name: "Channel", value: `<#${message.channelId}>`, inline: false },
      { name: "Content", value: deletedContent, inline: false },
      { name: "Timestamp", value: `<t:${Math.floor(Date.now() / 1_000)}:F>`, inline: false }
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch((error) => {
    logger.error({ err: error, guildId: message.guildId, channelId: channel.id }, "Failed to send deleted message log");
  });
}

export async function logEditedMessage(input: {
  oldMessage: Message;
  newMessage: Message;
  env: Env;
  settings: GuildSettingsShape;
}): Promise<void> {
  const { oldMessage, newMessage } = input;

  if (newMessage.partial) {
    await newMessage.fetch().catch(() => null);
  }

  if (!newMessage.guild) {
    return;
  }

  const author = newMessage.author ?? oldMessage.author;
  if (author?.bot) {
    return;
  }

  const oldContent = oldMessage.partial ? null : oldMessage.content;
  const newContent = newMessage.content;

  // Ignore updates that do not actually change the visible message content.
  if (oldContent !== null && oldContent === newContent) {
    return;
  }

  const channel = await resolveMessageLogChannel({
    message: newMessage,
    env: input.env,
    settings: input.settings
  });
  if (!channel) {
    return;
  }

  const authorTag = author?.tag ?? "Unknown User";
  const authorId = author?.id ?? "Unknown";
  const jumpUrl = `https://discord.com/channels/${newMessage.guildId}/${newMessage.channelId}/${newMessage.id}`;

  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle("Message Edited")
    .setThumbnail(author?.displayAvatarURL({ size: 512 }) ?? null)
    .addFields(
      { name: "User", value: authorTag, inline: true },
      { name: "User ID", value: authorId, inline: true },
      { name: "Channel", value: `<#${newMessage.channelId}>`, inline: false },
      { name: "Old Content", value: formatOldContent(oldContent), inline: false },
      { name: "New Content", value: formatContent(newContent), inline: false },
      { name: "Timestamp", value: `<t:${Math.floor(Date.now() / 1_000)}:F>`, inline: false }
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel("Jump to Message").setStyle(ButtonStyle.Link).setURL(jumpUrl)
  );

  await channel.send({ embeds: [embed], components: [row] }).catch((error) => {
    logger.error({ err: error, guildId: newMessage.guildId, channelId: channel.id }, "Failed to send edited message log");
  });
}
