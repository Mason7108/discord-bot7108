import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { moderationActionEmbed, sendModLog } from "../../../systems/logging.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) => option.setName("user").setDescription("Member to ban").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Reason"))
    .addIntegerOption((option) =>
      option.setName("delete_days").setDescription("Delete messages from recent days").setMinValue(0).setMaxValue(7)
    ),
  module: "moderation",
  userPerms: [PermissionFlagsBits.BanMembers],
  botPerms: [PermissionFlagsBits.BanMembers],
  async execute({ interaction, settings }) {
    if (!interaction.guild) {
      await replyError(interaction, "Unavailable", "Guild-only command.");
      return;
    }

    const targetUser = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const deleteDays = interaction.options.getInteger("delete_days") ?? 0;
    const deleteMessageSeconds = deleteDays * 24 * 60 * 60;

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (member && !member.bannable) {
      await replyError(interaction, "Action Blocked", "I cannot ban that member due to role hierarchy.");
      return;
    }

    await interaction.guild.members.ban(targetUser.id, { reason, deleteMessageSeconds });

    const embed = moderationActionEmbed("Ban", interaction.user, targetUser, reason);
    await sendModLog(interaction.guild, settings, embed);
    await replySuccess(interaction, "Member Banned", `${targetUser.tag} has been banned.`);
  }
};

export default command;
