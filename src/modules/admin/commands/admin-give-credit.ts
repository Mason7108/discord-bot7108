import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { adjustTrustScore } from "../../../core/services/userProfileService.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("admin-give-credit")
    .setDescription("Admin-only: increase a user's Trust Score")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((option) => option.setName("user").setDescription("User to adjust").setRequired(true))
    .addIntegerOption((option) =>
      option.setName("amount").setDescription("Trust Score amount to add").setRequired(true).setMinValue(1).setMaxValue(100)
    ),
  module: "admin",
  cooldownSec: 2,
  userPerms: [PermissionFlagsBits.Administrator],
  roleRequirement: "Admin",
  async execute({ interaction }) {
    if (!interaction.guildId) {
      await replyError(interaction, "Unavailable", "Guild-only command.");
      return;
    }

    const target = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);

    if (target.bot) {
      await replyError(interaction, "Invalid Target", "Bot accounts do not have Trust Scores.");
      return;
    }

    const profile = await adjustTrustScore(interaction.guildId, target.id, amount);
    await replySuccess(interaction, "Credit Updated", `Added **${amount}** Trust Score to ${target}. New score: **${profile.trustScore}**.`);
  }
};

export default command;
