import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Show a user's avatar")
    .addUserOption((option) => option.setName("user").setDescription("User to inspect")),
  module: "utility",
  cooldownSec: 2,
  async execute({ interaction }) {
    const user = interaction.options.getUser("user") ?? interaction.user;
    await interaction.reply({ content: user.displayAvatarURL({ size: 1024 }) });
  }
};

export default command;
