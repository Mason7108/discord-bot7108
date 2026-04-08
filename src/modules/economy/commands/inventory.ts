import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { getOrCreateProfile } from "../../../core/services/userProfileService.js";
import { infoEmbed } from "../../../utils/embeds.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("Show your inventory")
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
    const list = profile.inventory.length ? profile.inventory.map((item) => `• ${item}`).join("\n") : "No items yet.";

    await interaction.reply({ embeds: [infoEmbed(`Inventory: ${target.username}`, list)] });
  }
};

export default command;
