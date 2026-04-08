import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { updateGuildSettings } from "../../../core/services/guildSettingsService.js";
import { replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("setlevelrole")
    .setDescription("Assign a role reward for a level")
    .addIntegerOption((option) => option.setName("level").setDescription("Level threshold").setRequired(true).setMinValue(1))
    .addRoleOption((option) => option.setName("role").setDescription("Role to grant").setRequired(true)),
  module: "leveling",
  userPerms: [PermissionFlagsBits.ManageGuild],
  roleRequirement: "Admin",
  async execute({ interaction, settings }) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "Guild-only command.", ephemeral: true });
      return;
    }

    const level = interaction.options.getInteger("level", true);
    const role = interaction.options.getRole("role", true);

    const nextLevelRoles = settings.levelRoles.filter((entry) => entry.level !== level);
    nextLevelRoles.push({ level, roleId: role.id });
    nextLevelRoles.sort((a, b) => a.level - b.level);

    await updateGuildSettings(interaction.guildId, { levelRoles: nextLevelRoles } as never);
    await replySuccess(interaction, "Level Role Updated", `Members now receive ${role} at level **${level}**.`);
  }
};

export default command;
