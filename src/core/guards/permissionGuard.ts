import type { GuildMember } from "discord.js";
import type { CommandDefinition, GuildSettingsShape } from "../types.js";
import { hasRequiredRole } from "../services/rolePolicyService.js";

export type PermissionCheckResult =
  | { ok: true }
  | { ok: false; code: "user" | "bot" | "role"; reason: string };

export function hasPermissionForCommand(
  command: CommandDefinition,
  member: GuildMember,
  settings: GuildSettingsShape,
  botMember: GuildMember | null
): PermissionCheckResult {
  if (command.userPerms && command.userPerms.length > 0 && !member.permissions.has(command.userPerms)) {
    return { ok: false, code: "user", reason: "You are missing required Discord permissions for this command." };
  }

  if (command.botPerms && command.botPerms.length > 0 && botMember && !botMember.permissions.has(command.botPerms)) {
    return { ok: false, code: "bot", reason: "I do not have the required permissions to run this command." };
  }

  if (command.roleRequirement && !hasRequiredRole(member, settings, command.roleRequirement)) {
    return { ok: false, code: "role", reason: `This command requires the ${command.roleRequirement} role policy.` };
  }

  return { ok: true };
}
