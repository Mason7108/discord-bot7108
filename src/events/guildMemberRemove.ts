import { EmbedBuilder, type Guild, type Role } from "discord.js";
import { loadEnv } from "../config/env.js";
import type { EventDefinition } from "../core/types.js";
import { UserProfileModel } from "../models/UserProfile.js";
import { getGuildSettings } from "../core/services/guildSettingsService.js";
import { sendModLog } from "../systems/logging.js";
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
  name: "guildMemberRemove",
  async execute(_client, rawMember) {
    const member = rawMember as any;
    if (!member.guild) {
      return;
    }

    if (member.user?.bot) {
      return;
    }

    const verifiedRole = findRole(member.guild, env.VERIFIED_ROLE_ID, env.VERIFIED_ROLE_NAME);
    const memberRole = findRole(member.guild, env.MEMBER_ROLE_ID, env.MEMBER_ROLE_NAME);
    const wasVerifiedAtLeave =
      (verifiedRole && member.roles?.cache?.has?.(verifiedRole.id)) || (memberRole && member.roles?.cache?.has?.(memberRole.id));

    if (wasVerifiedAtLeave) {
      await UserProfileModel.findOneAndUpdate(
        { guildId: member.guild.id, userId: member.id },
        {
          $setOnInsert: { guildId: member.guild.id, userId: member.id },
          $set: { hasVerified: true, verifiedAt: new Date() }
        },
        { upsert: true }
      ).catch((error) => {
        logger.error({ err: error, guildId: member.guild.id, userId: member.id }, "Failed to persist verified state on member leave");
      });
    }

    const settings = await getGuildSettings(member.guild.id);
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("Member Left")
      .setDescription(`${member.user.tag} left the server.`)
      .setTimestamp();

    await sendModLog(member.guild, settings, embed);
  }
};

export default event;
