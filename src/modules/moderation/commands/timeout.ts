import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { ensureMemberTimeout, moderationActionEmbed, sendModLog } from "../../../systems/logging.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("user").setDescription("Member to timeout").setRequired(true))
    .addIntegerOption((option) =>
      option
        .setName("minutes")
        .setDescription("Timeout duration in minutes")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(10_080)
    )
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
    const minutes = interaction.options.getInteger("minutes", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!member || !member.moderatable) {
      await replyError(interaction, "Action Blocked", "I cannot timeout that member.");
      return;
    }

    await ensureMemberTimeout(member, minutes);

    const embed = moderationActionEmbed("Timeout", interaction.user, targetUser, `${reason} (${minutes}m)`);
    await sendModLog(interaction.guild, settings, embed);
    await replySuccess(interaction, "Member Timed Out", `${targetUser.tag} has been timed out for ${minutes} minutes.`);
  }
};

export default command;
