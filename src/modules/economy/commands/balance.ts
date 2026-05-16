import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { getOrCreateProfile } from "../../../core/services/userProfileService.js";
import { infoEmbed } from "../../../utils/embeds.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your or another user's balance")
    .addUserOption((option) => option.setName("user").setDescription("User to inspect")),
  module: "economy",
  cooldownSec: 2,
  async execute({ interaction }) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "Guild-only command.", ephemeral: true });
      return;
    }

    const target = interaction.options.getUser("user") ?? interaction.user;
    const profile = await getOrCreateProfile(interaction.guildId, target.id);
    const totalMoney = profile.coins + profile.bankSavings;
    const nextPaymentText =
      profile.activeLoanBalance > 0 && profile.loanNextPaymentDueAt
        ? `<t:${Math.floor(profile.loanNextPaymentDueAt.getTime() / 1_000)}:R>`
        : "No active loan";

    await interaction.reply({
      embeds: [
        infoEmbed(
          "7108 Bank Account Snapshot",
          `${target}\n\nWallet: **${profile.coins}** coins\nVault Savings: **${profile.bankSavings}** coins\nTotal Money: **${totalMoney}** coins\nActive Loan: **${profile.activeLoanBalance}** coins\nNext Loan Payment: **${nextPaymentText}**\n\nWelcome to 7108 Bank. Your coins are safe... probably.`
        )
      ],
      ephemeral: false
    });
  }
};

export default command;
