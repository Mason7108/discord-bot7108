import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { MODULE_NAMES } from "../../../core/constants.js";
import { infoEmbed } from "../../../utils/embeds.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show command modules and quick usage."),
  module: "admin",
  cooldownSec: 5,
  async execute({ client, interaction }) {
    const byModule = new Map<string, string[]>();

    for (const cmd of client.commands.values()) {
      if (!byModule.has(cmd.module)) {
        byModule.set(cmd.module, []);
      }
      byModule.get(cmd.module)!.push(`/${cmd.data.name}`);
    }

    const lines = MODULE_NAMES.map((moduleName) => {
      const items = byModule.get(moduleName) ?? [];
      const preview = items.slice(0, 10).join(", ") || "No commands";
      return `**${moduleName}**: ${preview}`;
    }).join("\n");

    await interaction.reply({
      embeds: [infoEmbed("Bot Help", `${lines}\n\nUse /modules status to view enabled modules.`)],
      ephemeral: true
    });
  }
};

export default command;
