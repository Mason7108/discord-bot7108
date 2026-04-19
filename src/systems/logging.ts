import {
  ChannelType,
  EmbedBuilder,
  PermissionsBitField,
  TextChannel,
  type Guild,
  type GuildMember,
  type User
} from "discord.js";
import type { GuildSettingsShape } from "../core/types.js";
import { logger } from "../utils/logger.js";

export async function sendModLog(guild: Guild, settings: GuildSettingsShape, embed: EmbedBuilder): Promise<void> {
  if (!settings.modules.logging || !settings.modLogChannelId) {
    return;
  }

  const channel = guild.channels.cache.get(settings.modLogChannelId);
  if (!channel || channel.type !== ChannelType.GuildText) {
    return;
  }

  await (channel as TextChannel).send({ embeds: [embed] });
}

export function moderationActionEmbed(action: string, moderator: User, target: User, reason: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xff5555)
    .setTitle(`Moderation: ${action}`)
    .addFields(
      { name: "Moderator", value: `${moderator.tag} (${moderator.id})` },
      { name: "Target", value: `${target.tag} (${target.id})` },
      { name: "Reason", value: reason }
    )
    .setTimestamp();
}

export async function createTicketChannel(
  guild: Guild,
  owner: User,
  settings: GuildSettingsShape
): Promise<TextChannel | null> {
  const everyoneRole = guild.roles.everyone;
  const staffRoleIds = [...new Set([...settings.staffRoleIds, ...settings.rolePolicy.moderatorRoleIds])];

  const permissionOverwrites = [
    {
      id: everyoneRole.id,
      deny: [PermissionsBitField.Flags.ViewChannel]
    },
    {
      id: owner.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    },
    ...staffRoleIds.map((roleId) => ({
      id: roleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    }))
  ];

  try {
    const channel = await guild.channels.create({
      name: `ticket-${owner.username}`.slice(0, 90),
      type: ChannelType.GuildText,
      parent: settings.ticketCategoryId,
      permissionOverwrites
    });

    return channel;
  } catch (error) {
    logger.error({ err: error }, "Failed to create ticket channel");
    return null;
  }
}

export async function ensureMemberTimeout(member: GuildMember, minutes: number): Promise<void> {
  const timeoutMs = minutes * 60 * 1_000;
  await member.timeout(timeoutMs);
}
