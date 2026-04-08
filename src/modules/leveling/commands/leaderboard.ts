import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { getTopByLevel } from "../../../core/services/userProfileService.js";
import { infoEmbed } from "../../../utils/embeds.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder().setName("leaderboard").setDescription("Top leveling players in this server"),
  module: "leveling",
  cooldownSec: 5,
  async execute({ interaction }) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "Guild-only command.", ephemeral: true });
      return;
    }

    const top = await getTopByLevel(interaction.guildId, 10);
    const lines = top.length
      ? top.map((entry, index) => `${index + 1}. <@${entry.userId}> - Level **${entry.level}** (${entry.xp} XP)`).join("\n")
      : "No leaderboard data yet.";

    await interaction.reply({ embeds: [infoEmbed("Level Leaderboard", lines)] });
  }
};

export default command;
