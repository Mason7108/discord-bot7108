import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { depositToSavings } from "../../../core/services/userProfileService.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("deposit")
    .setDescription("Move coins from your wallet to 7108 Bank savings")
    .addIntegerOption((option) =>
      option.setName("amount").setDescription("Whole number of coins to deposit").setRequired(true).setMinValue(1)
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
      const profile = await depositToSavings(interaction.guildId, interaction.user.id, amount);
      await replySuccess(
        interaction,
        "Deposit Complete",
        `Deposited **${amount}** coins into your Vault.\nWallet: **${profile.coins}** | Savings: **${profile.bankSavings}**`
      );
    } catch (error) {
      await replyError(interaction, "Deposit Failed", (error as Error).message);
    }
  }
};

export default command;
