import type { ChatInputCommandInteraction, GuildMember, VoiceBasedChannel } from "discord.js";
import type { BotClient } from "../../../core/types.js";

export function getVoiceChannel(interaction: ChatInputCommandInteraction): VoiceBasedChannel | null {
  const member = interaction.member as GuildMember;
  return member.voice.channel;
}

export function ensureDisTube(client: BotClient) {
  return client.distube;
}
