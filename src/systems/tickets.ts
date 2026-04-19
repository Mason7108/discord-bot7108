import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type GuildTextBasedChannel,
  type ModalSubmitInteraction,
  type TextChannel
} from "discord.js";
import { getGuildSettings } from "../core/services/guildSettingsService.js";
import type { GuildSettingsShape } from "../core/types.js";
import { TicketRecordModel } from "../models/TicketRecord.js";
import { logger } from "../utils/logger.js";
import { createTicketChannel } from "./logging.js";

export const TICKET_CREATE_BUTTON_ID = "ticket_create";
export const TICKET_CLOSE_BUTTON_ID = "ticket_close";
export const TICKET_CLOSE_WITH_REASON_BUTTON_ID = "ticket_close_reason";
export const TICKET_CLAIM_BUTTON_ID = "ticket_claim";
export const TICKET_CLOSE_CONFIRM_BUTTON_ID = "ticket_close_confirm";
export const TICKET_CLOSE_REASON_MODAL_ID = "ticket_close_reason_modal";
const TICKET_CLOSE_REASON_INPUT_ID = "reason";
const TICKET_TRANSCRIPT_BUTTON_LABEL = "View Online Transcript";

function ticketStaffRoleIds(settings: GuildSettingsShape): string[] {
  // Moderator policy roles are always treated as ticket staff visibility roles.
  return [...new Set([...settings.staffRoleIds, ...settings.rolePolicy.moderatorRoleIds])];
}

function isTicketStaffMember(member: GuildMember, settings: GuildSettingsShape): boolean {
  const hasStaffRole = ticketStaffRoleIds(settings).some((roleId) => member.roles.cache.has(roleId));

  return (
    hasStaffRole ||
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageMessages) ||
    member.permissions.has(PermissionFlagsBits.ModerateMembers)
  );
}

function ticketControlsRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(TICKET_CLOSE_BUTTON_ID).setLabel("Close").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(TICKET_CLOSE_WITH_REASON_BUTTON_ID).setLabel("Close With Reason").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(TICKET_CLAIM_BUTTON_ID).setLabel("Claim").setStyle(ButtonStyle.Success)
  );
}

function ticketPromptEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setDescription("Thank you for contacting support.\nPlease describe your issue and wait for a response.")
    .setFooter({ text: "Powered by tickets.bot" })
    .setTimestamp();
}

function closeConfirmationRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(TICKET_CLOSE_CONFIRM_BUTTON_ID).setLabel("Close").setStyle(ButtonStyle.Primary)
  );
}

function closeConfirmationEmbed(userTag: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("Close Confirmation")
    .setDescription("Please confirm that you want to close this ticket.")
    .addFields({ name: "Requested By", value: userTag })
    .setFooter({ text: "Powered by tickets.bot" })
    .setTimestamp();
}

function closeReasonModal(): ModalBuilder {
  const reasonInput = new TextInputBuilder()
    .setCustomId(TICKET_CLOSE_REASON_INPUT_ID)
    .setLabel("Reason")
    .setPlaceholder('Reason for closing the ticket, e.g. "Resolved"')
    .setRequired(true)
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(300);

  return new ModalBuilder()
    .setCustomId(TICKET_CLOSE_REASON_MODAL_ID)
    .setTitle("Close")
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));
}

function transcriptLinkRow(url: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(TICKET_TRANSCRIPT_BUTTON_LABEL).setURL(url)
  );
}

function userMention(userId?: string): string {
  if (!userId) {
    return "Unknown";
  }

  return `<@${userId}>`;
}

function buildTicketClosedSummaryEmbed(input: {
  ownerId: string;
  closedById: string;
  claimedById?: string;
  ticketId: string;
  openTime: Date;
  reason: string;
  ownerTag?: string;
  ownerAvatarUrl?: string;
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("Ticket Closed")
    .addFields(
      { name: "Ticket ID", value: input.ticketId, inline: true },
      { name: "Opened By", value: userMention(input.ownerId), inline: true },
      { name: "Closed By", value: userMention(input.closedById), inline: true },
      { name: "Open Time", value: `<t:${Math.floor(input.openTime.getTime() / 1_000)}:F>`, inline: true },
      { name: "Claimed By", value: input.claimedById ? userMention(input.claimedById) : "Unclaimed", inline: true },
      { name: "Reason", value: input.reason, inline: false }
    )
    .setTimestamp();

  if (input.ownerTag && input.ownerAvatarUrl) {
    embed.setAuthor({ name: input.ownerTag, iconURL: input.ownerAvatarUrl });
  }

  return embed;
}

async function generateTranscript(channel: GuildTextBasedChannel): Promise<string> {
  const fetched = await channel.messages.fetch({ limit: 100 });
  const lines = fetched
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((msg) => `[${new Date(msg.createdTimestamp).toISOString()}] ${msg.author.tag}: ${msg.content}`);

  return lines.join("\n");
}

async function sendTicketCloseDm(input: {
  guild: Guild;
  ownerId: string;
  embed: EmbedBuilder;
  transcriptText: string;
  transcriptFilename: string;
}): Promise<{ delivered: boolean; transcriptUrl?: string }> {
  const owner = await input.guild.client.users.fetch(input.ownerId).catch(() => null);
  if (!owner) {
    return { delivered: false };
  }

  const transcriptFile = new AttachmentBuilder(Buffer.from(input.transcriptText, "utf8"), {
    name: input.transcriptFilename
  });

  const sent = await owner.send({ embeds: [input.embed], files: [transcriptFile] }).catch(() => null);
  if (!sent) {
    return { delivered: false };
  }

  const attachmentUrl = sent.attachments.first()?.url;
  if (attachmentUrl) {
    await sent.edit({ components: [transcriptLinkRow(attachmentUrl)] }).catch(() => null);
  }

  return { delivered: true, transcriptUrl: attachmentUrl };
}

async function resolveTicketHistoryChannel(guild: Guild, settings: GuildSettingsShape): Promise<TextChannel | null> {
  if (!settings.ticketHistoryChannelId) {
    return null;
  }

  const channel =
    guild.channels.cache.get(settings.ticketHistoryChannelId) ??
    (await guild.channels.fetch(settings.ticketHistoryChannelId).catch(() => null));

  if (!channel || channel.type !== ChannelType.GuildText) {
    logger.error(
      { guildId: guild.id, ticketHistoryChannelId: settings.ticketHistoryChannelId },
      "Ticket history channel is missing or not a text channel"
    );
    return null;
  }

  return channel as TextChannel;
}

async function sendTicketHistoryLog(input: {
  guild: Guild;
  settings: GuildSettingsShape;
  embed: EmbedBuilder;
  transcriptText: string;
  transcriptFilename: string;
}): Promise<{ delivered: boolean; transcriptUrl?: string }> {
  const historyChannel = await resolveTicketHistoryChannel(input.guild, input.settings);
  if (!historyChannel) {
    return { delivered: false };
  }

  const transcriptFile = new AttachmentBuilder(Buffer.from(input.transcriptText, "utf8"), {
    name: input.transcriptFilename
  });

  const sent = await historyChannel.send({ embeds: [input.embed], files: [transcriptFile] }).catch(() => null);
  if (!sent) {
    return { delivered: false };
  }

  const attachmentUrl = sent.attachments.first()?.url;
  if (attachmentUrl) {
    await sent.edit({ components: [transcriptLinkRow(attachmentUrl)] }).catch(() => null);
  }

  return { delivered: true, transcriptUrl: attachmentUrl };
}

async function closeOpenTicket(input: {
  channel: GuildTextBasedChannel;
  recordChannelId: string;
  guildId: string;
  reason: string;
  closedByTag: string;
  closedById: string;
}): Promise<{ ok: boolean; message: string }> {
  // Centralized close flow used by slash, button, and modal actions.
  const record = await TicketRecordModel.findOne({
    guildId: input.guildId,
    channelId: input.recordChannelId,
    status: "open"
  });

  if (!record) {
    return { ok: false, message: "This channel is not an open ticket." };
  }

  const settings = await getGuildSettings(input.guildId);
  const transcript = await generateTranscript(input.channel);
  const transcriptFilename = `ticket-${input.channel.id}-transcript.txt`;

  const ownerUser = await input.channel.client.users.fetch(record.ownerId).catch(() => null);
  const summaryEmbed = buildTicketClosedSummaryEmbed({
    ownerId: record.ownerId,
    closedById: input.closedById,
    claimedById: record.claimedById,
    ticketId: record.channelId,
    openTime: record.createdAt,
    reason: input.reason,
    ownerTag: ownerUser?.tag,
    ownerAvatarUrl: ownerUser?.displayAvatarURL()
  });

  const closeEmbed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("Ticket Closed")
    .setDescription(`Reason: ${input.reason}`)
    .addFields({ name: "Closed By", value: `<@${input.closedById}> (${input.closedByTag})` })
    .setTimestamp();

  const inChannelTranscript = new AttachmentBuilder(Buffer.from(transcript, "utf8"), {
    name: transcriptFilename
  });
  await input.channel.send({ embeds: [closeEmbed], files: [inChannelTranscript] });

  const [dmResult, historyResult] = await Promise.all([
    sendTicketCloseDm({
      guild: input.channel.guild,
      ownerId: record.ownerId,
      embed: summaryEmbed,
      transcriptText: transcript,
      transcriptFilename
    }),
    sendTicketHistoryLog({
      guild: input.channel.guild,
      settings,
      embed: summaryEmbed,
      transcriptText: transcript,
      transcriptFilename
    })
  ]);

  record.status = "closed";
  record.closedAt = new Date();
  record.transcriptUrl = historyResult.transcriptUrl ?? dmResult.transcriptUrl;
  await record.save();

  setTimeout(() => {
    void input.channel.delete("Ticket closed").catch(() => null);
  }, 4_000);

  return { ok: true, message: "Ticket closed. Channel will be deleted shortly." };
}

async function resolveTicketActionContext(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  settings: GuildSettingsShape
): Promise<
  | { ok: false; message: string }
  | {
      ok: true;
      channel: GuildTextBasedChannel;
      ownerId: string;
      recordId: string;
      member: GuildMember;
      isStaff: boolean;
      isOwner: boolean;
    }
> {
  if (!interaction.guild || !interaction.channel || interaction.channel.isDMBased()) {
    return { ok: false, message: "This interaction can only be used in a guild text channel." };
  }

  const record = await TicketRecordModel.findOne({
    guildId: interaction.guild.id,
    channelId: interaction.channel.id,
    status: "open"
  });

  if (!record) {
    return { ok: false, message: "This channel is not an open ticket." };
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    return { ok: false, message: "Could not resolve your member profile." };
  }

  const isStaff = isTicketStaffMember(member, settings);
  const isOwner = record.ownerId === interaction.user.id;

  return {
    ok: true,
    channel: interaction.channel as GuildTextBasedChannel,
    ownerId: record.ownerId,
    recordId: record.id,
    member,
    isStaff,
    isOwner
  };
}

export function isTicketActionButton(customId: string): boolean {
  return (
    customId === TICKET_CLOSE_BUTTON_ID ||
    customId === TICKET_CLOSE_WITH_REASON_BUTTON_ID ||
    customId === TICKET_CLAIM_BUTTON_ID ||
    customId === TICKET_CLOSE_CONFIRM_BUTTON_ID
  );
}

export function isTicketCloseReasonModal(customId: string): boolean {
  return customId === TICKET_CLOSE_REASON_MODAL_ID;
}

export async function handleTicketCreateButton(
  interaction: ButtonInteraction,
  settings: GuildSettingsShape
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "This button can only be used in a server.", ephemeral: true });
    return;
  }

  const existing = await TicketRecordModel.findOne({
    guildId: interaction.guild.id,
    ownerId: interaction.user.id,
    status: "open"
  });

  if (existing) {
    await interaction.reply({ content: `You already have an open ticket: <#${existing.channelId}>`, ephemeral: true });
    return;
  }

  const channel = await createTicketChannel(interaction.guild, interaction.user, settings);

  if (!channel) {
    await interaction.reply({ content: "Failed to create a ticket channel.", ephemeral: true });
    return;
  }

  await TicketRecordModel.create({
    guildId: interaction.guild.id,
    channelId: channel.id,
    ownerId: interaction.user.id,
    status: "open"
  });

  await channel.send({
    // Ticket opener ping + action buttons matching common ticket-bot UX.
    content: `${interaction.user}`,
    embeds: [ticketPromptEmbed()],
    components: [ticketControlsRow()]
  });

  await interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
}

export async function handleTicketActionButton(
  interaction: ButtonInteraction,
  settings: GuildSettingsShape
): Promise<void> {
  const context = await resolveTicketActionContext(interaction, settings);
  if (!context.ok) {
    await interaction.reply({ content: context.message, ephemeral: true });
    return;
  }

  if (interaction.customId === TICKET_CLAIM_BUTTON_ID) {
    if (!context.isStaff) {
      await interaction.reply({ content: "Only ticket staff can claim tickets.", ephemeral: true });
      return;
    }

    const record = await TicketRecordModel.findById(context.recordId);
    if (!record || record.status !== "open") {
      await interaction.reply({ content: "This ticket is no longer open.", ephemeral: true });
      return;
    }

    if (record.claimedById && record.claimedById !== interaction.user.id) {
      await interaction.reply({ content: `This ticket is already claimed by <@${record.claimedById}>.`, ephemeral: true });
      return;
    }

    record.claimedById = interaction.user.id;
    await record.save();

    await interaction.reply({
      embeds: [
        new EmbedBuilder().setColor(0x57f287).setTitle("Ticket Claimed").setDescription(`${interaction.user} claimed this ticket.`).setTimestamp()
      ]
    });
    return;
  }

  if (!context.isStaff && !context.isOwner) {
    await interaction.reply({ content: "Only ticket staff or the ticket owner can close this ticket.", ephemeral: true });
    return;
  }

  if (interaction.customId === TICKET_CLOSE_BUTTON_ID) {
    await interaction.reply({
      embeds: [closeConfirmationEmbed(interaction.user.tag)],
      components: [closeConfirmationRow()]
    });
    return;
  }

  if (interaction.customId === TICKET_CLOSE_WITH_REASON_BUTTON_ID) {
    // Collect a reason via modal so staff can close with context.
    await interaction.showModal(closeReasonModal());
    return;
  }

  const result = await closeOpenTicket({
    channel: context.channel,
    recordChannelId: context.channel.id,
    guildId: interaction.guildId!,
    reason: `Closed by ${interaction.user.tag}`,
    closedByTag: interaction.user.tag,
    closedById: interaction.user.id
  });

  if (!result.ok) {
    await interaction.reply({ content: result.message, ephemeral: true });
    return;
  }

  await interaction.reply({ content: "Ticket closed. Channel will be deleted shortly." });
}

export async function handleTicketCloseReasonModal(
  interaction: ModalSubmitInteraction,
  settings: GuildSettingsShape
): Promise<void> {
  const context = await resolveTicketActionContext(interaction, settings);
  if (!context.ok) {
    await interaction.reply({ content: context.message, ephemeral: true });
    return;
  }

  if (!context.isStaff && !context.isOwner) {
    await interaction.reply({ content: "Only ticket staff or the ticket owner can close this ticket.", ephemeral: true });
    return;
  }

  const reason = interaction.fields.getTextInputValue(TICKET_CLOSE_REASON_INPUT_ID).trim();
  const closeReason = reason.length > 0 ? reason : `Closed by ${interaction.user.tag}`;

  const result = await closeOpenTicket({
    channel: context.channel,
    recordChannelId: context.channel.id,
    guildId: interaction.guildId!,
    reason: closeReason,
    closedByTag: interaction.user.tag,
    closedById: interaction.user.id
  });

  if (!result.ok) {
    await interaction.reply({ content: result.message, ephemeral: true });
    return;
  }

  await interaction.reply({ content: "Ticket closed. Channel will be deleted shortly." });
}

export async function closeTicketByChannel(
  interaction: ChatInputCommandInteraction,
  reason: string
): Promise<{ ok: boolean; message: string }> {
  if (!interaction.guild || !interaction.channel || interaction.channel.isDMBased()) {
    return { ok: false, message: "This command must run in a guild channel." };
  }

  const result = await closeOpenTicket({
    channel: interaction.channel as GuildTextBasedChannel,
    recordChannelId: interaction.channel.id,
    guildId: interaction.guild.id,
    reason,
    closedByTag: interaction.user.tag,
    closedById: interaction.user.id
  });

  return result;
}

export function createTicketSetupEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Support Tickets")
    .setDescription("Press the button below to open a private support ticket.")
    .setFooter({ text: "Powered by tickets.bot" })
    .setTimestamp();
}

export function ticketPermissionsForMember(ownerId: string, staffRoleIds: string[]) {
  return [
    {
      id: ownerId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
    },
    ...staffRoleIds.map((roleId) => ({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages
      ]
    }))
  ];
}
