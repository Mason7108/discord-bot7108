import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { moderationActionEmbed, sendModLog } from "../../../systems/logging.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Remove timeout from a member")
    .addUserOption((option) => option.setName("user").setDescription("Member to unmute").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Reason")),
  module: "moderation",
  userPerms: [PermissionFlagsBits.ModerateMembers],
  botPerms: [PermissionFlagsBits.ModerateMembers],
  roleRequirement: "Moderator",
  async execute({ interaction, settings }) {
    if (!interaction.guild) {
      await replyError(interaction, "Unavailable", "Guild-only command.");
      return;
    }

    const targetUser = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!member || !member.moderatable) {
      await replyError(interaction, "Action Blocked", "I cannot unmute that member.");
      return;
    }

    await member.timeout(null, reason);

    const embed = moderationActionEmbed("Unmute", interaction.user, targetUser, reason);
    await sendModLog(interaction.guild, settings, embed);
    await replySuccess(interaction, "Member Unmuted", `${targetUser.tag} has been unmuted.`);
  }
};

export default command;
