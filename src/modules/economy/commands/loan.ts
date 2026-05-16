import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { getLoanLimitForTrustScore, getOrCreateProfile, requestLoan } from "../../../core/services/userProfileService.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("loan")
    .setDescription("Request a fake currency loan from 7108 Bank")
    .addIntegerOption((option) =>
      option.setName("amount").setDescription("Whole number of coins to borrow").setRequired(true).setMinValue(1)
    ),
  module: "economy",
  cooldownSec: 12,
  async execute({ interaction }) {
    if (!interaction.guildId) {
      await replyError(interaction, "Unavailable", "Guild-only command.");
      return;
    }

    const amount = interaction.options.getInteger("amount", true);
    const profile = await getOrCreateProfile(interaction.guildId, interaction.user.id);
    const limit = getLoanLimitForTrustScore(profile.trustScore);

    try {
      const result = await requestLoan(interaction.guildId, interaction.user.id, amount);
      await replySuccess(
        interaction,
        "Loan Approved",
        `Loan approved! Spend wisely, or the Vault Goblin will be disappointed.\nBorrowed: **${amount}**\nInterest: **${Math.round(result.profile.loanInterestRate * 100)}%**\nTotal Owed: **${result.totalOwed}**\nNext Payment Due: <t:${Math.floor((result.profile.loanNextPaymentDueAt?.getTime() ?? Date.now()) / 1_000)}:R>`
      );
    } catch (error) {
      await replyError(interaction, "Loan Denied", `${(error as Error).message}\nCurrent loan limit: **${limit}** coins.`);
    }
  }
};

export default command;
