import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { loadEnv } from "../../../config/env.js";
import { findBanAppealRecordForAppealGuild, setPermanentBanStatus } from "../../../core/services/banAppealService.js";
import type { CommandDefinition } from "../../../core/types.js";
import { isAppealGuild } from "../../../systems/banAppeals.js";
import { moderationActionEmbed, sendModLog } from "../../../systems/logging.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const env = loadEnv();

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("setpermban")
    .setDescription("Lock or unlock a user's ban appeal form")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("user").setDescription("User to update").setRequired(true))
    .addBooleanOption((option) => option.setName("permanent").setDescription("Whether the ban is permanent").setRequired(true)),
  module: "moderation",
  userPerms: [PermissionFlagsBits.ModerateMembers],
  roleRequirement: "Moderator",
  async execute({ interaction, settings }) {
    if (!interaction.guildId || !interaction.guild || !isAppealGuild(interaction.guildId, env)) {
      await replyError(interaction, "Unavailable", "This command only works in the appeal server.");
      return;
    }

    const user = interaction.options.getUser("user", true);
    const permanent = interaction.options.getBoolean("permanent", true);
    const existing = await findBanAppealRecordForAppealGuild(interaction.guildId, user.id);
    if (!existing) {
      await replyError(interaction, "Not Found", "No ban record was found for that user.");
      return;
    }

    const updated = await setPermanentBanStatus(existing.mainGuildId, user.id, permanent);
    if (!updated) {
      await replyError(interaction, "Update Failed", "I could not update that ban record.");
      return;
    }

    const reason = permanent ? "Appeal form locked as permanent ban" : "Appeal form unlocked";
    await sendModLog(interaction.guild, settings, moderationActionEmbed("Set Permanent Ban", interaction.user, user, reason));
    await replySuccess(
      interaction,
      "Permanent Ban Updated",
      `${user.tag} is now marked as ${permanent ? "permanently banned" : "not permanently banned"}. Appeal status: ${updated.appealStatus}.`,
      true
    );
  }
};

export default command;
