import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { moderationActionEmbed, sendModLog } from "../../../systems/logging.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user by ID")
    .addStringOption((option) => option.setName("userid").setDescription("User ID to unban").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Reason")),
  module: "moderation",
  userPerms: [PermissionFlagsBits.BanMembers],
  botPerms: [PermissionFlagsBits.BanMembers],
  roleRequirement: "Moderator",
  async execute({ interaction, settings }) {
    if (!interaction.guild) {
      await replyError(interaction, "Unavailable", "Guild-only command.");
      return;
    }

    const userId = interaction.options.getString("userid", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";

    const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
    if (!ban) {
      await replyError(interaction, "Not Found", "No ban found for that user ID.");
      return;
    }

    await interaction.guild.members.unban(userId, reason);

    const embed = moderationActionEmbed("Unban", interaction.user, ban.user, reason);
    await sendModLog(interaction.guild, settings, embed);
    await replySuccess(interaction, "User Unbanned", `${ban.user.tag} has been unbanned.`);
  }
};

export default command;
