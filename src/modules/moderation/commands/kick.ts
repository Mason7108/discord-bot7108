import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { getOrCreateProfile } from "../../../core/services/userProfileService.js";
import { moderationActionEmbed, sendModLog } from "../../../systems/logging.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((option) => option.setName("user").setDescription("Member to kick").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Reason")),
  module: "moderation",
  userPerms: [PermissionFlagsBits.KickMembers],
  botPerms: [PermissionFlagsBits.KickMembers],
  async execute({ interaction, settings }) {
    if (!interaction.guild) {
      await replyError(interaction, "Unavailable", "Guild-only command.");
      return;
    }

    const targetUser = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!member) {
      await replyError(interaction, "Not Found", "Member not found in this guild.");
      return;
    }

    if (!member.kickable) {
      await replyError(interaction, "Action Blocked", "I cannot kick that member due to role hierarchy or permissions.");
      return;
    }

    await member.kick(reason);
    await getOrCreateProfile(interaction.guild.id, targetUser.id);

    const embed = moderationActionEmbed("Kick", interaction.user, targetUser, reason);
    await sendModLog(interaction.guild, settings, embed);
    await replySuccess(interaction, "Member Kicked", `${targetUser.tag} has been kicked.`);
  }
};

export default command;
