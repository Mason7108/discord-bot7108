import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { MODULE_NAMES } from "../../../core/constants.js";
import type { CommandDefinition, ModuleName } from "../../../core/types.js";
import { updateGuildSettings } from "../../../core/services/guildSettingsService.js";
import { infoEmbed } from "../../../utils/embeds.js";
import { replySuccess } from "../../../utils/replies.js";

const moduleChoices = MODULE_NAMES.map((moduleName) => ({
  name: moduleName,
  value: moduleName
}));

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("modules")
    .setDescription("Enable, disable, or inspect feature modules")
    .addSubcommand((sub) =>
      sub
        .setName("enable")
        .setDescription("Enable a module")
        .addStringOption((option) =>
          option
            .setName("module")
            .setDescription("Module to enable")
            .setRequired(true)
            .addChoices(...moduleChoices)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("disable")
        .setDescription("Disable a module")
        .addStringOption((option) =>
          option
            .setName("module")
            .setDescription("Module to disable")
            .setRequired(true)
            .addChoices(...moduleChoices)
        )
    )
    .addSubcommand((sub) => sub.setName("status").setDescription("Show module status for this guild")),
  module: "admin",
  cooldownSec: 2,
  userPerms: [PermissionFlagsBits.Administrator],
  roleRequirement: "Admin",
  async execute({ interaction, settings }) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "This command is only available in guilds.", ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand(true);

    if (sub === "status") {
      const statusLines = MODULE_NAMES.map((moduleName) => {
        const enabled = settings.modules[moduleName];
        return `• **${moduleName}**: ${enabled ? "Enabled" : "Disabled"}`;
      }).join("\n");

      await interaction.reply({ embeds: [infoEmbed("Module Status", statusLines)], ephemeral: true });
      return;
    }

    const targetModule = interaction.options.getString("module", true) as ModuleName;
    const nextValue = sub === "enable";

    await updateGuildSettings(interaction.guildId, {
      modules: {
        ...settings.modules,
        [targetModule]: nextValue
      }
    } as never);

    await replySuccess(
      interaction,
      "Module Updated",
      `Module **${targetModule}** has been ${nextValue ? "enabled" : "disabled"}.`
    );
  }
};

export default command;
