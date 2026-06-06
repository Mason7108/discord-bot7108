import { PermissionFlagsBits, SlashCommandBuilder, type GuildMember } from "discord.js";
import {
  getActiveCommandRestriction,
  removeCommandRestriction,
  restrictUserCommands
} from "../../../core/services/commandRestrictionService.js";
import type { CommandDefinition } from "../../../core/types.js";
import { moderationActionEmbed, sendModLog } from "../../../systems/logging.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const MAX_RESTRICTION_MINUTES = 10_080;

function getBotOwnerId(): string | undefined {
  const ownerId = process.env.BOT_OWNER_ID?.trim();
  return ownerId || undefined;
}

function formatExpiresAt(expiresAt?: Date): string {
  if (!expiresAt) {
    return "until an admin removes it";
  }

  const timestamp = Math.floor(expiresAt.getTime() / 1_000);
  return `until <t:${timestamp}:F> (<t:${timestamp}:R>)`;
}

function canRestrictTarget(actor: GuildMember, target: GuildMember): boolean {
  if (actor.id === target.id) {
    return false;
  }

  if (actor.guild.ownerId === actor.id) {
    return true;
  }

  return actor.roles.highest.position > target.roles.highest.position;
}

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("commandrestrict")
    .setDescription("Disable or restore bot7108 commands for a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Disable bot7108 commands for a member")
        .addUserOption((option) => option.setName("user").setDescription("Member to restrict").setRequired(true))
        .addIntegerOption((option) =>
          option
            .setName("minutes")
            .setDescription("Optional duration in minutes")
            .setMinValue(1)
            .setMaxValue(MAX_RESTRICTION_MINUTES)
        )
        .addStringOption((option) => option.setName("reason").setDescription("Reason"))
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Restore bot7108 commands for a member")
        .addUserOption((option) => option.setName("user").setDescription("Member to restore").setRequired(true))
        .addStringOption((option) => option.setName("reason").setDescription("Reason"))
    )
    .addSubcommand((sub) =>
      sub
        .setName("status")
        .setDescription("Check whether a member is command-restricted")
        .addUserOption((option) => option.setName("user").setDescription("Member to check").setRequired(true))
    ),
  module: "moderation",
  userPerms: [PermissionFlagsBits.Administrator],
  roleRequirement: "Admin",
  async execute({ interaction, settings }) {
    if (!interaction.guild || !interaction.guildId) {
      await replyError(interaction, "Unavailable", "Guild-only command.");
      return;
    }

    const subcommand = interaction.options.getSubcommand(true);
    const targetUser = interaction.options.getUser("user", true);

    if (subcommand === "status") {
      const restriction = await getActiveCommandRestriction(interaction.guildId, targetUser.id);
      if (!restriction) {
        await replySuccess(interaction, "Command Access", `${targetUser.tag} can use bot7108 commands.`);
        return;
      }

      await replySuccess(
        interaction,
        "Commands Restricted",
        `${targetUser.tag} cannot use bot7108 commands ${formatExpiresAt(restriction.expiresAt)}.\nReason: ${restriction.reason}`,
        true
      );
      return;
    }

    if (subcommand === "remove") {
      const reason = interaction.options.getString("reason") ?? "No reason provided";
      const removed = await removeCommandRestriction(interaction.guildId, targetUser.id);

      if (!removed) {
        await replyError(interaction, "No Restriction", `${targetUser.tag} is not command-restricted.`);
        return;
      }

      const embed = moderationActionEmbed("Command Restriction Removed", interaction.user, targetUser, reason);
      await sendModLog(interaction.guild, settings, embed);
      await replySuccess(interaction, "Commands Restored", `${targetUser.tag} can use bot7108 commands again.`);
      return;
    }

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    const actor = interaction.member as GuildMember;
    const botOwnerId = getBotOwnerId();

    if (!member) {
      await replyError(interaction, "Action Blocked", "That user is not in this server.");
      return;
    }

    if (targetUser.bot) {
      await replyError(interaction, "Action Blocked", "Bot accounts do not need command restrictions.");
      return;
    }

    if (targetUser.id === interaction.guild.ownerId || targetUser.id === botOwnerId) {
      await replyError(interaction, "Action Blocked", "You cannot command-restrict the bot owner or server owner.");
      return;
    }

    if (!canRestrictTarget(actor, member)) {
      await replyError(interaction, "Action Blocked", "You cannot command-restrict yourself or a member with an equal/higher role.");
      return;
    }

    const minutes = interaction.options.getInteger("minutes");
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const expiresAt = minutes ? new Date(Date.now() + minutes * 60 * 1_000) : undefined;
    const restriction = await restrictUserCommands({
      guildId: interaction.guildId,
      userId: targetUser.id,
      restrictedById: interaction.user.id,
      reason,
      expiresAt
    });

    const durationText = formatExpiresAt(restriction.expiresAt);
    const embed = moderationActionEmbed("Command Restriction Added", interaction.user, targetUser, `${reason} (${durationText})`);
    await sendModLog(interaction.guild, settings, embed);
    await replySuccess(interaction, "Commands Restricted", `${targetUser.tag} cannot use bot7108 commands ${durationText}.`);
  }
};

export default command;
