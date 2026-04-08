import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { getTopByCoins } from "../../../core/services/userProfileService.js";
import { infoEmbed } from "../../../utils/embeds.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder().setName("eco-leaderboard").setDescription("Top economy players in this server"),
  module: "economy",
  cooldownSec: 5,
  async execute({ interaction }) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "Guild-only command.", ephemeral: true });
      return;
    }

    const top = await getTopByCoins(interaction.guildId, 10);
    const lines = top.length
      ? top.map((entry, index) => `${index + 1}. <@${entry.userId}> - **${entry.coins}** coins`).join("\n")
      : "No leaderboard data yet.";

    await interaction.reply({ embeds: [infoEmbed("Economy Leaderboard", lines)] });
  }
};

export default command;
