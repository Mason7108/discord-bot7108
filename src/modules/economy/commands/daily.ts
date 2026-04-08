import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { claimDaily } from "../../../core/services/userProfileService.js";
import { replySuccess } from "../../../utils/replies.js";
import { warningEmbed } from "../../../utils/embeds.js";
import { msToHuman } from "../../../utils/time.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder().setName("daily").setDescription("Claim your daily reward"),
  module: "economy",
  cooldownSec: 3,
  async execute({ interaction }) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "Guild-only command.", ephemeral: true });
      return;
    }

    const result = await claimDaily(interaction.guildId, interaction.user.id);

    if (!result.ok) {
      await interaction.reply({
        embeds: [warningEmbed("Daily Cooldown", `Try again in ${msToHuman(result.msRemaining)}.`)],
        ephemeral: true
      });
      return;
    }

    await replySuccess(
      interaction,
      "Daily Claimed",
      `You received **${result.awarded}** coins. Balance: **${result.balance}** coins.`
    );
  }
};

export default command;
