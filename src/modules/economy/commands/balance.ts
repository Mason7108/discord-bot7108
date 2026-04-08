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

    await interaction.reply({
      embeds: [infoEmbed("Balance", `${target} has **${profile.coins}** coins.`)],
      ephemeral: false
    });
  }
};

export default command;
