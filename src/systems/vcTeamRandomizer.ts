import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  type ButtonInteraction,
  type Collection,
  type Guild,
  type GuildMember,
  type VoiceBasedChannel
} from "discord.js";
import { randomUUID } from "node:crypto";

export const SPLIT_VC_PREFIX = "splitvc";

type SplitAction = "split" | "reshuffle" | "return";

interface SplitVcSession {
  id: string;
  guildId: string;
  sourceChannelId: string;
  hostUserId: string;
  teamCount: number;
  targetChannelIds: string[];
  autoCreate: boolean;
  memberIds: string[];
  originalChannelByMember: Record<string, string>;
  createdAtMs: number;
}

const SESSION_TTL_MS = 60 * 60 * 1_000;
const splitSessions = new Map<string, SplitVcSession>();

function nowMs(): number {
  return Date.now();
}

function cleanupExpiredSessions(): void {
  const now = nowMs();
  for (const [id, session] of splitSessions.entries()) {
    if (now - session.createdAtMs > SESSION_TTL_MS) {
      splitSessions.delete(id);
    }
  }
}

export function createSplitSession(input: {
  guildId: string;
  sourceChannelId: string;
  hostUserId: string;
  teamCount: number;
  targetChannelIds: string[];
  autoCreate: boolean;
  memberIds: string[];
}): SplitVcSession {
  cleanupExpiredSessions();

  const id = randomUUID().slice(0, 8);
  const session: SplitVcSession = {
    id,
    guildId: input.guildId,
    sourceChannelId: input.sourceChannelId,
    hostUserId: input.hostUserId,
    teamCount: input.teamCount,
    targetChannelIds: input.targetChannelIds,
    autoCreate: input.autoCreate,
    memberIds: input.memberIds,
    originalChannelByMember: Object.fromEntries(input.memberIds.map((memberId) => [memberId, input.sourceChannelId])),
    createdAtMs: nowMs()
  };

  splitSessions.set(id, session);
  return session;
}

function parseButtonId(customId: string): { action: SplitAction; sessionId: string } | null {
  const parts = customId.split(":");
  if (parts.length !== 3 || parts[0] !== SPLIT_VC_PREFIX) {
    return null;
  }

  const action = parts[1] as SplitAction;
  if (action !== "split" && action !== "reshuffle" && action !== "return") {
    return null;
  }

  return {
    action,
    sessionId: parts[2]
  };
}

export function isSplitVcButton(customId: string): boolean {
  return customId.startsWith(`${SPLIT_VC_PREFIX}:`);
}

export function buildSplitButtons(sessionId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${SPLIT_VC_PREFIX}:split:${sessionId}`).setLabel("Split Teams").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${SPLIT_VC_PREFIX}:reshuffle:${sessionId}`).setLabel("Shuffle Again").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${SPLIT_VC_PREFIX}:return:${sessionId}`).setLabel("Return Everyone").setStyle(ButtonStyle.Danger)
  );
}

function shuffleMemberIds(memberIds: string[]): string[] {
  const result = [...memberIds];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const temp = result[index];
    result[index] = result[randomIndex];
    result[randomIndex] = temp;
  }
  return result;
}

export function buildEvenTeamSizes(totalMembers: number, teamCount: number): number[] {
  const baseSize = Math.floor(totalMembers / teamCount);
  const extraCount = totalMembers % teamCount;

  return Array.from({ length: teamCount }, (_, index) => (index < extraCount ? baseSize + 1 : baseSize));
}

function voiceChannelCollectionToMembers(channelMembers: Collection<string, GuildMember>): GuildMember[] {
  return channelMembers.filter((member) => !member.user.bot).map((member) => member);
}

function getSourceMembers(sourceChannel: VoiceBasedChannel): GuildMember[] {
  return voiceChannelCollectionToMembers(sourceChannel.members);
}

async function resolveTargetVoiceChannels(guild: Guild, session: SplitVcSession): Promise<VoiceBasedChannel[]> {
  const uniqueTargetIds: string[] = [];
  for (const id of session.targetChannelIds) {
    if (!uniqueTargetIds.includes(id)) {
      uniqueTargetIds.push(id);
    }
  }

  const resolved = uniqueTargetIds
    .map((id) => guild.channels.cache.get(id))
    .filter((channel): channel is VoiceBasedChannel => {
      if (!channel) {
        return false;
      }

      return channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice;
    });

  if (resolved.length >= session.teamCount) {
    const final = resolved.slice(0, session.teamCount);
    session.targetChannelIds = final.map((channel) => channel.id);
    return final;
  }

  if (!session.autoCreate) {
    throw new Error(`Please provide ${session.teamCount} target voice channels or enable auto-create.`);
  }

  const botMember = guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new Error("I need ManageChannels permission to auto-create team voice channels.");
  }

  const sourceChannel = guild.channels.cache.get(session.sourceChannelId);
  const parentId = sourceChannel && "parentId" in sourceChannel ? sourceChannel.parentId : null;

  while (resolved.length < session.teamCount) {
    const nextIndex = resolved.length + 1;
    const created = await guild.channels.create({
      name: `Team ${nextIndex}`,
      type: ChannelType.GuildVoice,
      parent: parentId ?? undefined
    });
    resolved.push(created);
  }

  session.targetChannelIds = resolved.map((channel) => channel.id);
  return resolved;
}

async function splitMembersIntoTeams(
  guild: Guild,
  sourceChannel: VoiceBasedChannel,
  session: SplitVcSession,
  reshuffleOnly: boolean
): Promise<{ movedCount: number; teamSizes: number[] }> {
  const botMember = guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.MoveMembers)) {
    throw new Error("I need MoveMembers permission to move users between voice channels.");
  }

  if (!reshuffleOnly) {
    const sourceMembers = getSourceMembers(sourceChannel);
    if (sourceMembers.length === 0) {
      throw new Error("No non-bot users are currently in the selected source voice channel.");
    }

    session.memberIds = sourceMembers.map((member) => member.id);
    session.originalChannelByMember = Object.fromEntries(session.memberIds.map((memberId) => [memberId, sourceChannel.id]));
  }

  const teamChannels = await resolveTargetVoiceChannels(guild, session);

  const connectedMembers: GuildMember[] = [];
  for (const memberId of session.memberIds) {
    const member = await guild.members.fetch(memberId).catch(() => null);
    if (member && member.voice.channelId && !member.user.bot) {
      connectedMembers.push(member);
    }
  }

  if (connectedMembers.length === 0) {
    throw new Error("No tracked users are currently connected to voice channels.");
  }

  if (session.teamCount > connectedMembers.length) {
    throw new Error("Team count cannot be greater than the number of connected users.");
  }

  const shuffledIds = shuffleMemberIds(connectedMembers.map((member) => member.id));
  const teamSizes = buildEvenTeamSizes(shuffledIds.length, session.teamCount);

  let pointer = 0;
  let movedCount = 0;

  for (let teamIndex = 0; teamIndex < session.teamCount; teamIndex += 1) {
    const channel = teamChannels[teamIndex];
    const size = teamSizes[teamIndex];

    for (let slot = 0; slot < size; slot += 1) {
      const memberId = shuffledIds[pointer];
      pointer += 1;

      const member = connectedMembers.find((candidate) => candidate.id === memberId);
      if (!member) {
        continue;
      }

      await member.voice.setChannel(channel, "Split VC teams").catch(() => null);
      movedCount += 1;
    }
  }

  return { movedCount, teamSizes };
}

async function returnMembersToSource(guild: Guild, session: SplitVcSession): Promise<number> {
  const botMember = guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.MoveMembers)) {
    throw new Error("I need MoveMembers permission to return users to the source voice channel.");
  }

  let movedCount = 0;

  for (const memberId of session.memberIds) {
    const member = await guild.members.fetch(memberId).catch(() => null);
    const originalChannelId = session.originalChannelByMember[memberId];
    const originalChannel = originalChannelId ? guild.channels.cache.get(originalChannelId) : null;

    if (!member || !originalChannel || !("isVoiceBased" in originalChannel) || !originalChannel.isVoiceBased()) {
      continue;
    }

    await member.voice.setChannel(originalChannel, "Return from split VC teams").catch(() => null);
    movedCount += 1;
  }

  return movedCount;
}

export async function handleSplitVcButton(interaction: ButtonInteraction): Promise<void> {
  const parsed = parseButtonId(interaction.customId);
  if (!parsed) {
    return;
  }

  const session = splitSessions.get(parsed.sessionId);
  if (!session) {
    await interaction.reply({ content: "This split session expired. Run /splitvc again.", ephemeral: true });
    return;
  }

  if (!interaction.guild || interaction.guild.id !== session.guildId) {
    await interaction.reply({ content: "This split session belongs to a different guild.", ephemeral: true });
    return;
  }

  const canMoveMembers = interaction.memberPermissions?.has(PermissionFlagsBits.MoveMembers) ?? false;
  if (interaction.user.id !== session.hostUserId && !canMoveMembers) {
    await interaction.reply({ content: "\u274c You do not have permission to use this command.", ephemeral: true });
    return;
  }

  const sourceChannel = interaction.guild.channels.cache.get(session.sourceChannelId);
  if (!sourceChannel || !("isVoiceBased" in sourceChannel) || !sourceChannel.isVoiceBased()) {
    await interaction.reply({ content: "Source voice channel no longer exists.", ephemeral: true });
    return;
  }

  try {
    if (parsed.action === "return") {
      const movedCount = await returnMembersToSource(interaction.guild, session);
      await interaction.reply({ content: `\u2705 Returned ${movedCount} player(s) to the original voice channel.` });
      return;
    }

    const reshuffle = parsed.action === "reshuffle";
    const result = await splitMembersIntoTeams(interaction.guild, sourceChannel, session, reshuffle);

    if (reshuffle) {
      await interaction.reply({
        content: `\u2705 Teams shuffled again! Moved ${result.movedCount} player(s) across ${session.teamCount} teams.`
      });
      return;
    }

    await interaction.reply({
      content: `\u2705 Teams created successfully! Moved ${result.movedCount} player(s) into ${session.teamCount} teams.`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "An unknown error occurred while splitting teams.";
    await interaction.reply({ content: `\u274c ${message}`, ephemeral: true });
  }
}
