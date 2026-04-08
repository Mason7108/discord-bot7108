import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildTextBasedChannel
} from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { closeTicketByChannel, createTicketSetupEmbed, TICKET_CREATE_BUTTON_ID } from "../../../systems/tickets.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Manage support tickets")
    .addSubcommand((sub) => sub.setName("setup").setDescription("Post a ticket create panel"))
    .addSubcommand((sub) =>
      sub
        .setName("close")
        .setDescription("Close the current ticket")
        .addStringOption((option) => option.setName("reason").setDescription("Close reason"))
    )
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a member to this ticket")
        .addUserOption((option) => option.setName("user").setDescription("User to add").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a member from this ticket")
        .addUserOption((option) => option.setName("user").setDescription("User to remove").setRequired(true))
    ),
  module: "tickets",
  roleRequirement: "Helper",
  async execute({ interaction }) {
    if (!interaction.guild || !interaction.channel || interaction.channel.isDMBased()) {
      await replyError(interaction, "Unavailable", "Guild-only command.");
      return;
    }

    const channel = interaction.channel as GuildTextBasedChannel;
    const sub = interaction.options.getSubcommand(true);

    if (sub === "setup") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
        await replyError(interaction, "Permission Denied", "You need Manage Channels to run ticket setup.");
        return;
      }

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(TICKET_CREATE_BUTTON_ID).setLabel("Create Ticket").setStyle(ButtonStyle.Primary)
      );

      await channel.send({ embeds: [createTicketSetupEmbed()], components: [row] });
      await replySuccess(interaction, "Ticket Panel Posted", "Users can now create tickets from this panel.", true);
      return;
    }

    if (sub === "close") {
      const reason = interaction.options.getString("reason") ?? "No reason provided";
      const result = await closeTicketByChannel(interaction, reason);

      if (!result.ok) {
        await replyError(interaction, "Close Failed", result.message);
        return;
      }

      await replySuccess(interaction, "Ticket Closed", result.message, true);
      return;
    }

    if (!("permissionOverwrites" in channel)) {
      await replyError(interaction, "Unavailable", "This channel does not support ticket permission updates.");
      return;
    }

    const target = interaction.options.getUser("user", true);

    if (sub === "add") {
      await channel.permissionOverwrites.edit(target.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      });

      await replySuccess(interaction, "Ticket Updated", `${target} has been added to this ticket.`);
      return;
    }

    await channel.permissionOverwrites.edit(target.id, {
      ViewChannel: false,
      SendMessages: false,
      ReadMessageHistory: false
    });

    await replySuccess(interaction, "Ticket Updated", `${target} has been removed from this ticket.`);
  }
};

export default command;
