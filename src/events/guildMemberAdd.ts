import { EmbedBuilder, PermissionFlagsBits, type Guild, type Role } from "discord.js";
import { loadEnv } from "../config/env.js";
import type { EventDefinition } from "../core/types.js";
import { getGuildSettings } from "../core/services/guildSettingsService.js";
import { sendModLog } from "../systems/logging.js";
import { sendWelcomeMessage } from "../systems/welcome.js";
import { logger } from "../utils/logger.js";

const env = loadEnv();

function findRole(guild: Guild, roleId: string | undefined, roleName: string): Role | null {
  if (roleId) {
    return guild.roles.cache.get(roleId) ?? null;
  }

  const normalized = roleName.trim().toLowerCase();
  return guild.roles.cache.find((role) => role.name.trim().toLowerCase() === normalized) ?? null;
}

const event: EventDefinition = {
  name: "guildMemberAdd",
  async execute(_client, rawMember) {
    const member = rawMember as any;
    if (!member.guild) {
      return;
    }

    if (!member.user || member.user.bot) {
      return;
    }

    const guild = member.guild as Guild;
    const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      logger.warn({ guildId: guild.id }, "Cannot enforce unverified-on-join: missing ManageRoles permission");
    } else {
      const unverifiedRole = findRole(guild, env.UNVERIFIED_ROLE_ID, env.UNVERIFIED_ROLE_NAME);
      const verifiedRole = findRole(guild, env.VERIFIED_ROLE_ID, env.VERIFIED_ROLE_NAME);
      const memberRole = findRole(guild, env.MEMBER_ROLE_ID, env.MEMBER_ROLE_NAME);
      const highestBotRolePosition = botMember.roles.highest.position;

      const canManageRole = (role: Role | null): role is Role =>
        Boolean(role && role.position < highestBotRolePosition && role.id !== guild.roles.everyone.id);

      try {
        if (canManageRole(unverifiedRole) && !member.roles.cache.has(unverifiedRole.id)) {
          await member.roles.add(unverifiedRole.id, "New joiner starts as unverified");
        }

        if (canManageRole(verifiedRole) && member.roles.cache.has(verifiedRole.id)) {
          await member.roles.remove(verifiedRole.id, "Reset to unverified on join");
        }

        if (canManageRole(memberRole) && member.roles.cache.has(memberRole.id)) {
          await member.roles.remove(memberRole.id, "Reset to unverified on join");
        }
      } catch (error) {
        logger.error({ err: error, guildId: guild.id, userId: member.id }, "Failed to enforce unverified role on join");
      }
    }

    const settings = await getGuildSettings(member.guild.id);
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("Member Joined")
      .setDescription(`${member.user.tag} joined the server.`)
      .setTimestamp();

    await sendModLog(member.guild, settings, embed);
    await sendWelcomeMessage(member, env);
  }
};

export default event;
