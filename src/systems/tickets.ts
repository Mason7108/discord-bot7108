import {
  AttachmentBuilder,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  PermissionsBitField,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel
} from "discord.js";
import { TicketRecordModel } from "../models/TicketRecord.js";
import { createTicketChannel } from "./logging.js";
import type { GuildSettingsShape } from "../core/types.js";

export const TICKET_CREATE_BUTTON_ID = "ticket_create";

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
    content: `<@${interaction.user.id}> ticket created. Staff will assist you shortly.`
  });

  await interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
}

export async function closeTicketByChannel(
  interaction: ChatInputCommandInteraction,
  reason: string
): Promise<{ ok: boolean; message: string }> {
  if (!interaction.guild || !interaction.channel || interaction.channel.isDMBased()) {
    return { ok: false, message: "This command must run in a guild channel." };
  }

  const channel = interaction.channel as GuildTextBasedChannel;

  const record = await TicketRecordModel.findOne({
    guildId: interaction.guild.id,
    channelId: channel.id,
    status: "open"
  });

  if (!record) {
    return { ok: false, message: "This channel is not an open ticket." };
  }

  const transcript = await generateTranscript(channel);
  const transcriptFile = new AttachmentBuilder(Buffer.from(transcript, "utf8"), {
    name: `ticket-${channel.id}-transcript.txt`
  });

  const closeEmbed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("Ticket Closed")
    .setDescription(`Reason: ${reason}`)
    .setTimestamp();

  await channel.send({ embeds: [closeEmbed], files: [transcriptFile] });

  record.status = "closed";
  record.closedAt = new Date();
  record.transcriptUrl = `attachment://ticket-${channel.id}-transcript.txt`;
  await record.save();

  setTimeout(() => {
    void interaction.channel?.delete("Ticket closed").catch(() => null);
  }, 4_000);

  return { ok: true, message: "Ticket closed. Channel will be deleted shortly." };
}

async function generateTranscript(channel: GuildTextBasedChannel): Promise<string> {
  const fetched = await channel.messages.fetch({ limit: 100 });
  const lines = fetched
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((msg) => `[${new Date(msg.createdTimestamp).toISOString()}] ${msg.author.tag}: ${msg.content}`);

  return lines.join("\n");
}

export function createTicketSetupEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Support Tickets")
    .setDescription("Press the button below to open a private support ticket.")
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

export const ticketBaseOverwrite = {
  id: "@everyone",
  deny: [PermissionsBitField.Flags.ViewChannel],
  type: ChannelType.GuildText
};
