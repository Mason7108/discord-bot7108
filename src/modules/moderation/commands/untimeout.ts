import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { moderationActionEmbed, sendModLog } from "../../../systems/logging.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove timeout from a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("user").setDescription("Member to untimeout").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Reason")),
  module: "moderation",
  userPerms: [PermissionFlagsBits.ModerateMembers],
  botPerms: [PermissionFlagsBits.ModerateMembers],
  async execute({ interaction, settings }) {
    if (!interaction.guild) {
      await replyError(interaction, "Unavailable", "Guild-only command.");
      return;
    }

    const targetUser = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!member || !member.moderatable) {
      await replyError(interaction, "Action Blocked", "I cannot remove timeout from that member.");
      return;
    }

    await member.timeout(null, reason);

    const embed = moderationActionEmbed("Untimeout", interaction.user, targetUser, reason);
    await sendModLog(interaction.guild, settings, embed);
    await replySuccess(interaction, "Timeout Removed", `${targetUser.tag} is no longer timed out.`);
  }
};

export default command;
