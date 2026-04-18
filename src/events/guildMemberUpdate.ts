import { PermissionFlagsBits, type Guild, type Role } from "discord.js";
import { loadEnv } from "../config/env.js";
import type { EventDefinition } from "../core/types.js";
import { UserProfileModel } from "../models/UserProfile.js";
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
  name: "guildMemberUpdate",
  async execute(_client, rawOldMember, rawNewMember) {
    const oldMember = rawOldMember as any;
    const newMember = rawNewMember as any;

    if (!newMember?.guild || newMember.user?.bot || !newMember.roles?.cache) {
      return;
    }

    const guild = newMember.guild as Guild;
    const verifiedRole = findRole(guild, env.VERIFIED_ROLE_ID, env.VERIFIED_ROLE_NAME);
    const memberRole = findRole(guild, env.MEMBER_ROLE_ID, env.MEMBER_ROLE_NAME);

    if (!verifiedRole || !memberRole || verifiedRole.id === memberRole.id) {
      return;
    }

    const hadVerifiedBefore = oldMember?.roles?.cache?.has?.(verifiedRole.id) ?? false;
    const hasVerifiedNow = newMember.roles.cache.has(verifiedRole.id);
    const alreadyHasMemberRole = newMember.roles.cache.has(memberRole.id);

    if (!hasVerifiedNow || hadVerifiedBefore || alreadyHasMemberRole) {
      return;
    }

    const botMember = guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      logger.warn({ guildId: guild.id }, "Cannot auto-assign member role: missing ManageRoles permission");
      return;
    }

    if (memberRole.position >= botMember.roles.highest.position) {
      logger.warn(
        { guildId: guild.id, memberRoleId: memberRole.id },
        "Cannot auto-assign member role: role is above or equal to bot's highest role"
      );
      return;
    }

    try {
      await newMember.roles.add(memberRole.id, `Auto-assign ${memberRole.name} after verification`);
      await UserProfileModel.findOneAndUpdate(
        { guildId: guild.id, userId: newMember.id },
        {
          $setOnInsert: { guildId: guild.id, userId: newMember.id },
          $set: { hasVerified: true, verifiedAt: new Date() }
        },
        { upsert: true }
      ).catch(() => null);

      logger.info(
        { guildId: guild.id, userId: newMember.id, verifiedRoleId: verifiedRole.id, memberRoleId: memberRole.id },
        "Auto-assigned member role after verification"
      );
    } catch (error) {
      logger.error({ err: error, guildId: guild.id, userId: newMember.id }, "Failed to auto-assign member role");
    }
  }
};

export default event;
