import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { resetLoanData } from "../../../core/services/userProfileService.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("admin-bank-reset")
    .setDescription("Admin-only: reset a user's active loan data")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((option) => option.setName("user").setDescription("User to reset").setRequired(true)),
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
    if (target.bot) {
      await replyError(interaction, "Invalid Target", "Bot accounts do not have bank loan profiles.");
      return;
    }

    await resetLoanData(interaction.guildId, target.id);
    await replySuccess(interaction, "Loan Reset", `Loan data reset for ${target}.`);
  }
};

export default command;
