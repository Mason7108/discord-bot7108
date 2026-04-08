import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { UserProfileModel } from "../../../models/UserProfile.js";
import type { CommandDefinition } from "../../../core/types.js";
import { moderationActionEmbed, sendModLog } from "../../../systems/logging.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("user").setDescription("Member to warn").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Warning reason").setRequired(true)),
  module: "moderation",
  userPerms: [PermissionFlagsBits.ModerateMembers],
  async execute({ interaction, settings }) {
    if (!interaction.guildId || !interaction.guild) {
      await replyError(interaction, "Unavailable", "Guild-only command.");
      return;
    }

    const target = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason", true);

    const profile = await UserProfileModel.findOneAndUpdate(
      { guildId: interaction.guildId, userId: target.id },
      {
        $setOnInsert: { guildId: interaction.guildId, userId: target.id },
        $push: {
          warnings: {
            moderatorId: interaction.user.id,
            reason,
            createdAt: new Date()
          }
        }
      },
      { upsert: true, new: true }
    );

    const warningCount = profile?.warnings.length ?? 1;
    const embed = moderationActionEmbed("Warn", interaction.user, target, reason);
    await sendModLog(interaction.guild, settings, embed);
    await replySuccess(interaction, "Warning Added", `${target.tag} now has ${warningCount} warning(s).`);
  }
};

export default command;
