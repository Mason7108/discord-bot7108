import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set channel slowmode")
    .addIntegerOption((option) =>
      option
        .setName("seconds")
        .setDescription("Slowmode in seconds")
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600)
    ),
  module: "moderation",
  userPerms: [PermissionFlagsBits.ManageChannels],
  botPerms: [PermissionFlagsBits.ManageChannels],
  roleRequirement: "Moderator",
  async execute({ interaction }) {
    const seconds = interaction.options.getInteger("seconds", true);

    if (!interaction.channel || !("setRateLimitPerUser" in interaction.channel)) {
      await replyError(interaction, "Unavailable", "This channel does not support slowmode.");
      return;
    }

    await (interaction.channel as any).setRateLimitPerUser(seconds);
    await replySuccess(interaction, "Slowmode Updated", `Slowmode set to ${seconds} second(s).`);
  }
};

export default command;
