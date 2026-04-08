import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { infoEmbed } from "../../../utils/embeds.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Show user info")
    .addUserOption((option) => option.setName("user").setDescription("User to inspect")),
  module: "utility",
  cooldownSec: 2,
  async execute({ interaction }) {
    if (!interaction.guild) {
      await interaction.reply({ content: "Guild-only command.", ephemeral: true });
      return;
    }

    const target = interaction.options.getUser("user") ?? interaction.user;
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    const text = [
      `Tag: **${target.tag}**`,
      `ID: \`${target.id}\``,
      `Created: <t:${Math.floor(target.createdTimestamp / 1000)}:R>`,
      member?.joinedTimestamp ? `Joined: <t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : "Joined: Unknown"
    ].join("\n");

    await interaction.reply({ embeds: [infoEmbed("User Info", text)] });
  }
};

export default command;
