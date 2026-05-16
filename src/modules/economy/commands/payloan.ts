import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { payLoan } from "../../../core/services/userProfileService.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("payloan")
    .setDescription("Pay part of your active loan from wallet coins")
    .addIntegerOption((option) =>
      option.setName("amount").setDescription("Whole number of coins to pay").setRequired(true).setMinValue(1)
    ),
  module: "economy",
  cooldownSec: 6,
  async execute({ interaction }) {
    if (!interaction.guildId) {
      await replyError(interaction, "Unavailable", "Guild-only command.");
      return;
    }

    const amount = interaction.options.getInteger("amount", true);

    try {
      const { profile, payment } = await payLoan(interaction.guildId, interaction.user.id, amount);
      if (profile.activeLoanBalance <= 0) {
        await replySuccess(
          interaction,
          "Loan Cleared",
          `Payment received. Your credit score is looking cleaner than ever.\nPaid: **${payment}**\nRemaining Loan: **0**\nWallet: **${profile.coins}**`
        );
        return;
      }

      await replySuccess(
        interaction,
        "Payment Received",
        `You still owe the bank, but at least you're trying.\nPaid: **${payment}**\nRemaining Loan: **${profile.activeLoanBalance}**\nNext Due: <t:${Math.floor((profile.loanNextPaymentDueAt?.getTime() ?? Date.now()) / 1_000)}:R>`
      );
    } catch (error) {
      await replyError(interaction, "Payment Failed", (error as Error).message);
    }
  }
};

export default command;
