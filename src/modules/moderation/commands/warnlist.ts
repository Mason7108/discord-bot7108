import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { UserProfileModel } from "../../../models/UserProfile.js";
import type { CommandDefinition } from "../../../core/types.js";
import { infoEmbed } from "../../../utils/embeds.js";
import { replyError } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("warnlist")
    .setDescription("Show warnings for a member")
    .addUserOption((option) => option.setName("user").setDescription("Member").setRequired(true)),
  module: "moderation",
  userPerms: [PermissionFlagsBits.ModerateMembers],
  roleRequirement: "Moderator",
  async execute({ interaction }) {
    if (!interaction.guildId) {
      await replyError(interaction, "Unavailable", "Guild-only command.");
      return;
    }

    const target = interaction.options.getUser("user", true);
    const profile = await UserProfileModel.findOne({ guildId: interaction.guildId, userId: target.id }).lean();
    const warnings = profile?.warnings ?? [];

    if (warnings.length === 0) {
      await interaction.reply({ embeds: [infoEmbed("Warnings", `${target.tag} has no warnings.`)], ephemeral: true });
      return;
    }

    const text = warnings
      .slice(-10)
      .map((warning, index) => {
        const when = new Date(warning.createdAt).toLocaleString();
        return `${index + 1}. **${warning.reason}** by <@${warning.moderatorId}> (${when})`;
      })
      .join("\n");

    await interaction.reply({ embeds: [infoEmbed(`Warnings for ${target.tag}`, text)], ephemeral: true });
  }
};

export default command;
