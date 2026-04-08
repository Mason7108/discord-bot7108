import type { GuildMember } from "discord.js";

export function memberHasRole(member: GuildMember, roleId: string): boolean {
  return member.roles.cache.has(roleId);
}
