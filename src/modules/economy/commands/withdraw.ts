import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { withdrawFromSavings } from "../../../core/services/userProfileService.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("withdraw")
    .setDescription("Move coins from 7108 Bank savings back to your wallet")
    .addIntegerOption((option) =>
      option.setName("amount").setDescription("Whole number of coins to withdraw").setRequired(true).setMinValue(1)
    ),
  module: "economy",
  cooldownSec: 4,
  async execute({ interaction }) {
    if (!interaction.guildId) {
      await replyError(interaction, "Unavailable", "Guild-only command.");
      return;
    }

    const amount = interaction.options.getInteger("amount", true);

    try {
      const profile = await withdrawFromSavings(interaction.guildId, interaction.user.id, amount);
      await replySuccess(
        interaction,
        "Withdraw Complete",
        `Withdrew **${amount}** coins from your Vault.\nWallet: **${profile.coins}** | Savings: **${profile.bankSavings}**`
      );
    } catch (error) {
      await replyError(interaction, "Withdraw Failed", (error as Error).message);
    }
  }
};

export default command;
