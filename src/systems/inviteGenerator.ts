import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  PermissionFlagsBits,
  type ButtonInteraction,
  type GuildBasedChannel,
  type GuildTextBasedChannel,
  type Message
} from "discord.js";
import type { Env } from "../config/env.js";
import type { BotClient } from "../core/types.js";
import {
  loadInviteGeneratorMessageState,
  saveInviteGeneratorMessageState
} from "../utils/inviteGeneratorMessageManager.js";
import { logger } from "../utils/logger.js";

export const INVITE_GENERATOR_BUTTON_ID = "invite_generator:create";
const DEFAULT_INVITE_GENERATOR_CHANNEL_ID = "1503925310280827032";
const PANEL_TITLE = "Invite Link Generator";
const PANEL_DESCRIPTION = "Click the button below to generate a one-time-created infinite-use invite link.";

function generatorEmbed(): EmbedBuilder {
  return new EmbedBuilder().setColor(0x5865f2).setTitle(PANEL_TITLE).setDescription(PANEL_DESCRIPTION).setTimestamp();
}

function generatorButtonRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(INVITE_GENERATOR_BUTTON_ID).setLabel("Generate Invite Link").setStyle(ButtonStyle.Primary)
  );
}

function isGuildTextChannel(channel: GuildBasedChannel | null): channel is GuildTextBasedChannel {
  return Boolean(channel && channel.isTextBased() && "messages" in channel);
}

function isStoredGeneratorMessage(message: Message, botUserId: string): boolean {
  if (message.author.id !== botUserId) {
    return false;
  }

  const hasExpectedTitle = message.embeds.some((embed) => embed.title === PANEL_TITLE);
  const hasExpectedButton = message.components.some((row) => {
    if (!("components" in row)) {
      return false;
    }

    return row.components.some(
      (component) => component.type === ComponentType.Button && "customId" in component && component.customId === INVITE_GENERATOR_BUTTON_ID
    );
  });

  return hasExpectedTitle && hasExpectedButton;
}

export function isInviteGeneratorButton(customId: string): boolean {
  return customId === INVITE_GENERATOR_BUTTON_ID;
}

export async function ensureInviteGeneratorMessage(client: BotClient, env: Env): Promise<void> {
  const channelId = env.INVITE_GENERATOR_CHANNEL_ID ?? DEFAULT_INVITE_GENERATOR_CHANNEL_ID;
  const channel = await client.channels.fetch(channelId).catch(() => null);

  if (!channel || !("guildId" in channel) || !isGuildTextChannel(channel)) {
    logger.warn({ channelId }, "Invite generator setup skipped: channel not found or not text-based");
    return;
  }

  const guildId = channel.guildId;
  const botUserId = client.user?.id;
  if (!botUserId) {
    return;
  }

  const stored = await loadInviteGeneratorMessageState();
  if (stored && stored.guildId === guildId && stored.channelId === channel.id) {
    const existing = await channel.messages.fetch(stored.messageId).catch(() => null);
    if (existing && isStoredGeneratorMessage(existing, botUserId)) {
      logger.info({ channelId: channel.id, messageId: existing.id }, "Invite generator message already exists");
      return;
    }
  }

  const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  const discovered = recent?.find((message) => isStoredGeneratorMessage(message, botUserId)) ?? null;
  if (discovered) {
    await saveInviteGeneratorMessageState({
      guildId,
      channelId: channel.id,
      messageId: discovered.id
    });
    logger.info({ channelId: channel.id, messageId: discovered.id }, "Reused existing invite generator message");
    return;
  }

  const sent = await channel.send({
    embeds: [generatorEmbed()],
    components: [generatorButtonRow()]
  });

  await saveInviteGeneratorMessageState({
    guildId,
    channelId: channel.id,
    messageId: sent.id
  });

  logger.info({ channelId: channel.id, messageId: sent.id }, "Created invite generator message");
}

export async function handleInviteGeneratorButton(interaction: ButtonInteraction): Promise<void> {
  if (interaction.user.bot) {
    await interaction.reply({ content: "Bots cannot use this button.", ephemeral: true });
    return;
  }

  if (!interaction.guild || !interaction.channel || interaction.channel.isDMBased()) {
    await interaction.reply({ content: "This button only works in a server text channel.", ephemeral: true });
    return;
  }

  const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
  if (!me?.permissions.has(PermissionFlagsBits.CreateInstantInvite)) {
    await interaction.reply({ content: "I need the Create Invite permission to generate links.", ephemeral: true });
    return;
  }

  if (!("createInvite" in interaction.channel) || typeof interaction.channel.createInvite !== "function") {
    await interaction.reply({ content: "This channel type does not support invite generation.", ephemeral: true });
    return;
  }

  const invite = await interaction.channel
    .createInvite({
      maxAge: 0,
      maxUses: 0,
      temporary: false,
      unique: true,
      reason: `Invite generated by ${interaction.user.tag} (${interaction.user.id})`
    })
    .catch((error) => {
      logger.error({ err: error, guildId: interaction.guildId, channelId: interaction.channelId }, "Failed to generate invite link");
      return null;
    });

  if (!invite) {
    await interaction.reply({ content: "I couldn't generate an invite link. Check my channel permissions.", ephemeral: true });
    return;
  }

  await interaction.reply({
    content: `Here is your infinite-use invite link:\n${invite.url}`,
    ephemeral: true
  });
}
