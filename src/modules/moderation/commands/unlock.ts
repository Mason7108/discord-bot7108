import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder().setName("unlock").setDescription("Unlock the current channel"),
  module: "moderation",
  userPerms: [PermissionFlagsBits.ManageChannels],
  botPerms: [PermissionFlagsBits.ManageChannels],
  roleRequirement: "Moderator",
  async execute({ interaction }) {
    if (!interaction.channel || !interaction.guild || !("permissionOverwrites" in interaction.channel)) {
      await replyError(interaction, "Unavailable", "Guild text channel required.");
      return;
    }

    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
      SendMessages: null
    });

    await replySuccess(interaction, "Channel Unlocked", "Members can send messages again.");
  }
};

export default command;
