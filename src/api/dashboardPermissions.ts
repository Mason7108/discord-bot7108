import {
  ChannelType,
  PermissionsBitField,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type PermissionResolvable
} from "discord.js";
import type { BotClient } from "../core/types.js";

export interface DiscordGuildSummary {
  id: string;
  name: string;
  icon?: string | null;
  owner?: boolean;
  permissions?: string;
}

export function hasManageGuildPermissionBits(permissions: string | undefined, owner?: boolean): boolean {
  if (owner) {
    return true;
  }

  if (!permissions || !/^\d+$/.test(permissions)) {
    return false;
  }

  const bits = BigInt(permissions);
  return (
    (bits & PermissionFlagsBits.Administrator) === PermissionFlagsBits.Administrator ||
    (bits & PermissionFlagsBits.ManageGuild) === PermissionFlagsBits.ManageGuild
  );
}

export async function fetchActorMember(guild: Guild, userId: string): Promise<GuildMember | null> {
  return guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
}

export async function requireManageGuildAccess(
  client: BotClient,
  guildId: string,
  userId: string
): Promise<{ ok: true; guild: Guild; actor: GuildMember; botMember: GuildMember } | { ok: false; status: number; error: string }> {
  const guild = client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) {
    return { ok: false, status: 404, error: "bot7108 is not installed in this server." };
  }

  const actor = await fetchActorMember(guild, userId);
  if (!actor) {
    return { ok: false, status: 403, error: "You are not a member of this server." };
  }

  if (!actor.permissions.has(PermissionFlagsBits.Administrator) && !actor.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return { ok: false, status: 403, error: "You need Manage Server permission to use this dashboard." };
  }

  const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!botMember) {
    return { ok: false, status: 503, error: "Could not verify bot permissions in this server." };
  }

  return { ok: true, guild, actor, botMember };
}

export function hasRequiredPermissions(member: GuildMember, permissions: PermissionResolvable[]): boolean {
  return permissions.length === 0 || member.permissions.has(permissions);
}

export function evaluateModerationTarget(input: {
  guild: Guild;
  actor: GuildMember;
  botMember: GuildMember;
  target: GuildMember;
}): { ok: true } | { ok: false; error: string } {
  if (input.actor.id === input.target.id) {
    return { ok: false, error: "You cannot moderate yourself." };
  }

  if (input.target.id === input.guild.ownerId) {
    return { ok: false, error: "The server owner cannot be moderated from the dashboard." };
  }

  if (input.botMember.id === input.target.id) {
    return { ok: false, error: "bot7108 cannot target itself." };
  }

  if (input.actor.id !== input.guild.ownerId && input.actor.roles.highest.comparePositionTo(input.target.roles.highest) <= 0) {
    return { ok: false, error: "You cannot target a member with an equal or higher role." };
  }

  if (input.botMember.roles.highest.comparePositionTo(input.target.roles.highest) <= 0) {
    return { ok: false, error: "bot7108 cannot target a member above or equal to its highest role." };
  }

  return { ok: true };
}

export function moderationPermissionsForAction(action: string): {
  user: PermissionResolvable[];
  bot: PermissionResolvable[];
  destructive: boolean;
} {
  switch (action) {
    case "warn":
    case "remove_warning":
    case "timeout":
    case "untimeout":
      return { user: [PermissionFlagsBits.ModerateMembers], bot: [PermissionFlagsBits.ModerateMembers], destructive: false };
    case "kick":
      return { user: [PermissionFlagsBits.KickMembers], bot: [PermissionFlagsBits.KickMembers], destructive: true };
    case "ban":
    case "unban":
      return { user: [PermissionFlagsBits.BanMembers], bot: [PermissionFlagsBits.BanMembers], destructive: true };
    case "purge":
      return { user: [PermissionFlagsBits.ManageMessages], bot: [PermissionFlagsBits.ManageMessages], destructive: true };
    case "lock":
    case "unlock":
    case "slowmode":
      return { user: [PermissionFlagsBits.ManageChannels], bot: [PermissionFlagsBits.ManageChannels], destructive: action === "lock" };
    default:
      return { user: [], bot: [], destructive: false };
  }
}

export function isConfigurableTextChannel(channel: unknown): channel is {
  id: string;
  name: string;
  type: ChannelType;
} {
  return Boolean(channel && typeof channel === "object" && "type" in channel && (channel as { type: ChannelType }).type === ChannelType.GuildText);
}

export function canAssignRole(botMember: GuildMember, roleId: string): boolean {
  const role = botMember.guild.roles.cache.get(roleId);
  return Boolean(role && role.id !== botMember.guild.roles.everyone.id && role.position < botMember.roles.highest.position);
}

export function serializeGuildIcon(guild: { id: string; icon?: string | null }): string | null {
  if (!guild.icon) {
    return null;
  }

  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`;
}
