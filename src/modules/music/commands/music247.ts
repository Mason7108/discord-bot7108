import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { updateGuildSettings } from "../../../core/services/guildSettingsService.js";
import { replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("music247")
    .setDescription("Toggle 24/7 music mode")
    .addBooleanOption((option) => option.setName("enabled").setDescription("Enable or disable").setRequired(true)),
  module: "music",
  userPerms: [PermissionFlagsBits.ManageGuild],
  roleRequirement: "Admin",
  async execute({ interaction }) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "Guild-only command.", ephemeral: true });
      return;
    }

    const enabled = interaction.options.getBoolean("enabled", true);
    await updateGuildSettings(interaction.guildId, { music247Enabled: enabled } as never);
    await replySuccess(interaction, "Music 24/7 Updated", `24/7 mode is now **${enabled ? "enabled" : "disabled"}**.`);
  }
};

export default command;
