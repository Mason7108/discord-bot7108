import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { loadEnv } from "../../../config/env.js";
import { findBanAppealRecordForAppealGuild } from "../../../core/services/banAppealService.js";
import type { CommandDefinition } from "../../../core/types.js";
import { appealStatusEmbed, isAppealGuild } from "../../../systems/banAppeals.js";
import { replyError } from "../../../utils/replies.js";

const env = loadEnv();

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("banstatus")
    .setDescription("Show a user's main-server ban appeal record")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("user").setDescription("User to check").setRequired(true)),
  module: "moderation",
  userPerms: [PermissionFlagsBits.ModerateMembers],
  roleRequirement: "Moderator",
  async execute({ interaction }) {
    if (!interaction.guildId || !isAppealGuild(interaction.guildId, env)) {
      await replyError(interaction, "Unavailable", "This command only works in the appeal server.");
      return;
    }

    const user = interaction.options.getUser("user", true);
    const record = await findBanAppealRecordForAppealGuild(interaction.guildId, user.id);
    if (!record) {
      await replyError(interaction, "Not Found", "No ban record was found for that user.");
      return;
    }

    await interaction.reply({ embeds: [appealStatusEmbed(record)], ephemeral: true });
  }
};

export default command;
