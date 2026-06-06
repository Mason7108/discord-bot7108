import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { loadEnv } from "../../../config/env.js";
import { findBanAppealRecordForAppealGuild, reviewAppeal } from "../../../core/services/banAppealService.js";
import type { CommandDefinition } from "../../../core/types.js";
import { isAppealGuild, sendAppealReviewNotice } from "../../../systems/banAppeals.js";
import { moderationActionEmbed, sendModLog } from "../../../systems/logging.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const env = loadEnv();

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("reviewappeal")
    .setDescription("Approve or deny a submitted ban appeal")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("user").setDescription("User whose appeal to review").setRequired(true))
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription("Review decision")
        .setRequired(true)
        .addChoices({ name: "Approve", value: "approve" }, { name: "Deny", value: "deny" })
    )
    .addStringOption((option) => option.setName("reason").setDescription("Review reason").setRequired(true)),
  module: "moderation",
  userPerms: [PermissionFlagsBits.ModerateMembers],
  roleRequirement: "Moderator",
  async execute({ client, interaction, settings }) {
    if (!interaction.guildId || !interaction.guild || !isAppealGuild(interaction.guildId, env)) {
      await replyError(interaction, "Unavailable", "This command only works in the appeal server.");
      return;
    }

    const user = interaction.options.getUser("user", true);
    const action = interaction.options.getString("action", true) as "approve" | "deny";
    const reason = interaction.options.getString("reason", true);
    const existing = await findBanAppealRecordForAppealGuild(interaction.guildId, user.id);
    if (!existing) {
      await replyError(interaction, "Not Found", "No ban record was found for that user.");
      return;
    }

    const updated = await reviewAppeal({
      mainGuildId: existing.mainGuildId,
      userId: user.id,
      status: action === "approve" ? "approved" : "denied",
      reviewedById: interaction.user.id,
      reviewReason: reason
    });

    if (!updated) {
      await replyError(interaction, "Not Submitted", "That user does not have an appeal waiting for review.");
      return;
    }

    await sendAppealReviewNotice(client, updated, updated.appealStatus as "approved" | "denied", reason);
    await sendModLog(interaction.guild, settings, moderationActionEmbed("Review Appeal", interaction.user, user, `${action}: ${reason}`));

    const resultText = action === "approve" ? "approved" : "denied";
    const approvalNote =
      action === "approve" ? " Staff should manually unban the user from the main server if appropriate." : "";
    await replySuccess(interaction, "Appeal Reviewed", `${user.tag}'s appeal was ${resultText}.${approvalNote}`, true);
  }
};

export default command;
