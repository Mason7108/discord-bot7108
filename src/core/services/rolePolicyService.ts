import type { GuildMember } from "discord.js";
import type { GuildSettingsShape, RoleRequirement } from "../types.js";

export function hasRequiredRole(member: GuildMember, settings: GuildSettingsShape, requirement: RoleRequirement): boolean {
  if (requirement === "User") {
    return true;
  }

  if (member.permissions.has("Administrator")) {
    return true;
  }

  if (requirement === "Admin") {
    return settings.rolePolicy.adminRoleIds.some((id) => member.roles.cache.has(id));
  }

  if (requirement === "Moderator") {
    return (
      settings.rolePolicy.adminRoleIds.some((id) => member.roles.cache.has(id)) ||
      settings.rolePolicy.moderatorRoleIds.some((id) => member.roles.cache.has(id))
    );
  }

  return (
    settings.rolePolicy.adminRoleIds.some((id) => member.roles.cache.has(id)) ||
    settings.rolePolicy.moderatorRoleIds.some((id) => member.roles.cache.has(id)) ||
    settings.rolePolicy.helperRoleIds.some((id) => member.roles.cache.has(id))
  );
}
