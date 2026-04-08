import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { infoEmbed } from "../../../utils/embeds.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder().setName("serverinfo").setDescription("Show server info"),
  module: "utility",
  cooldownSec: 2,
  async execute({ interaction }) {
    if (!interaction.guild) {
      await interaction.reply({ content: "Guild-only command.", ephemeral: true });
      return;
    }

    const guild = interaction.guild;
    const owner = await guild.fetchOwner().catch(() => null);
    const text = [
      `Name: **${guild.name}**`,
      `ID: \`${guild.id}\``,
      `Owner: ${owner?.user.tag ?? "Unknown"}`,
      `Members: **${guild.memberCount}**`,
      `Created: <t:${Math.floor(guild.createdTimestamp / 1000)}:R>`
    ].join("\n");

    await interaction.reply({ embeds: [infoEmbed("Server Info", text)] });
  }
};

export default command;
