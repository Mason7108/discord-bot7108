import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Bulk delete recent messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Number of messages to delete (1-100)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    ),
  module: "moderation",
  userPerms: [PermissionFlagsBits.ManageMessages],
  botPerms: [PermissionFlagsBits.ManageMessages],
  async execute({ interaction }) {
    const amount = interaction.options.getInteger("amount", true);

    if (!interaction.channel || !("bulkDelete" in interaction.channel)) {
      await replyError(interaction, "Unavailable", "This command only works in text channels.");
      return;
    }

    const deleted = await interaction.channel.bulkDelete(amount, true);
    await replySuccess(interaction, "Purge Complete", `Deleted ${deleted.size} message(s).`, true);
  }
};

export default command;
