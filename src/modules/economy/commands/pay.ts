import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { transferCoinsAtomic } from "../../../core/services/userProfileService.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("pay")
    .setDescription("Pay another user")
    .addUserOption((option) => option.setName("user").setDescription("Recipient").setRequired(true))
    .addIntegerOption((option) =>
      option.setName("amount").setDescription("Amount to send").setRequired(true).setMinValue(1)
    ),
  module: "economy",
  cooldownSec: 2,
  async execute({ interaction }) {
    if (!interaction.guildId) {
      await replyError(interaction, "Unavailable", "Guild-only command.");
      return;
    }

    const recipient = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);

    try {
      const result = await transferCoinsAtomic(interaction.guildId, interaction.user.id, recipient.id, amount);
      await replySuccess(
        interaction,
        "Transfer Complete",
        `Sent **${amount}** coins to ${recipient}. Your balance: **${result.fromBalance}**.`
      );
    } catch (error) {
      await replyError(interaction, "Transfer Failed", (error as Error).message);
    }
  }
};

export default command;
