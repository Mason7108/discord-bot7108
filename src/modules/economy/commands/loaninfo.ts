import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { getOrCreateProfile } from "../../../core/services/userProfileService.js";
import { infoEmbed } from "../../../utils/embeds.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder().setName("loaninfo").setDescription("Show your current loan details and Trust Score"),
  module: "economy",
  cooldownSec: 3,
  async execute({ interaction }) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "Guild-only command.", ephemeral: true });
      return;
    }

    const profile = await getOrCreateProfile(interaction.guildId, interaction.user.id);

    if (profile.activeLoanBalance <= 0) {
      await interaction.reply({
        embeds: [
          infoEmbed(
            "7108 Bank Loan Info",
            `No active loan.\nCredit Rank / Trust Score: **${profile.trustScore}**\nTotal Paid Back: **${profile.totalLoanPaidBack}**\nAccount Created: <t:${Math.floor(profile.bankAccountCreatedAt.getTime() / 1_000)}:F>\nLoan Shark Detector: **Calm**`
          )
        ]
      });
      return;
    }

    const amountPaid = profile.activeLoanTotalOwed - profile.activeLoanBalance;
    const nextPayment =
      profile.loanNextPaymentDueAt ? `<t:${Math.floor(profile.loanNextPaymentDueAt.getTime() / 1_000)}:F>` : "Unknown";

    await interaction.reply({
      embeds: [
        infoEmbed(
          "7108 Bank Loan Info",
          `Original Loan: **${profile.activeLoanOriginalAmount}**\nInterest Rate: **${Math.round(profile.loanInterestRate * 100)}%**\nTotal Owed: **${profile.activeLoanTotalOwed}**\nRemaining Balance: **${profile.activeLoanBalance}**\nAmount Paid (This Loan): **${amountPaid}**\nTotal Paid Back: **${profile.totalLoanPaidBack}**\nNext Payment Due: **${nextPayment}**\nTrust Score: **${profile.trustScore}**\nAccount Created: <t:${Math.floor(profile.bankAccountCreatedAt.getTime() / 1_000)}:F>`
        )
      ]
    });
  }
};

export default command;
