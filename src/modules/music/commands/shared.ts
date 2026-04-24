import { PermissionFlagsBits, type ChatInputCommandInteraction, type GuildMember, type VoiceBasedChannel } from "discord.js";
import type { BotClient } from "../../../core/types.js";

export function getVoiceChannel(interaction: ChatInputCommandInteraction): VoiceBasedChannel | null {
  const member = interaction.member as GuildMember;
  return member.voice.channel;
}

export function getBotVoiceChannel(interaction: ChatInputCommandInteraction): VoiceBasedChannel | null {
  const me = interaction.guild?.members.me;
  return me?.voice.channel ?? null;
}

export function ensureSameVoiceAsBot(interaction: ChatInputCommandInteraction): {
  ok: boolean;
  voiceChannel?: VoiceBasedChannel;
  reason?: string;
} {
  const voiceChannel = getVoiceChannel(interaction);
  if (!voiceChannel) {
    return { ok: false, reason: "You must join a voice channel first." };
  }

  const botVoiceChannel = getBotVoiceChannel(interaction);
  if (botVoiceChannel && botVoiceChannel.id !== voiceChannel.id) {
    return {
      ok: false,
      reason: `You must be in ${botVoiceChannel.toString()} to control the current music queue.`
    };
  }

  return { ok: true, voiceChannel };
}

export function getMissingBotPlaybackPermissions(
  interaction: ChatInputCommandInteraction,
  voiceChannel: VoiceBasedChannel
): string[] {
  const botMember = interaction.guild?.members.me;
  if (!botMember) {
    return ["ViewChannel", "Connect", "Speak"];
  }

  const permissions = voiceChannel.permissionsFor(botMember);
  if (!permissions) {
    return ["ViewChannel", "Connect", "Speak"];
  }

  const missing: string[] = [];
  if (!permissions.has(PermissionFlagsBits.ViewChannel)) {
    missing.push("ViewChannel");
  }
  if (!permissions.has(PermissionFlagsBits.Connect)) {
    missing.push("Connect");
  }
  if (!permissions.has(PermissionFlagsBits.Speak)) {
    missing.push("Speak");
  }

  return missing;
}

export function ensureDisTube(client: BotClient) {
  return client.distube;
}
