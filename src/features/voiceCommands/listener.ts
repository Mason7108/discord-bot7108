import {
  EndBehaviorType,
  VoiceConnectionStatus,
  getVoiceConnection,
  type VoiceConnection,
  type VoiceConnectionState
} from "@discordjs/voice";
import type { Guild, GuildMember, GuildTextBasedChannel } from "discord.js";
import prism from "prism-media";
import { Writable } from "node:stream";
import { loadEnv } from "../../config/env.js";
import { checkAndSetCooldown } from "../../core/guards/cooldownGuard.js";
import { getGuildSettings } from "../../core/services/guildSettingsService.js";
import type { BotClient, GuildSettingsShape } from "../../core/types.js";
import { errorEmbed, infoEmbed } from "../../utils/embeds.js";
import { logger } from "../../utils/logger.js";
import { getVoiceRecognitionStatus, transcribePcmAudio } from "./transcribe.js";
import {
  VOICE_COMMAND_PRIVACY_NOTICE,
  isVoiceCommandAudioEligible,
  resolveVoiceCommandTextChannel,
  routeVoiceCommandTranscript
} from "./voiceCommandRouter.js";

const PCM_BYTES_PER_SECOND = 48_000 * 2 * 2;
const MIN_AUDIO_BYTES = Math.floor(PCM_BYTES_PER_SECOND * 0.35);
const UNAVAILABLE_NOTICE_INTERVAL_MS = 5 * 60 * 1_000;

interface ActiveVoiceCommandListener {
  connection: VoiceConnection;
  speakingListener: (userId: string) => void;
  stateListener: (oldState: VoiceConnectionState, newState: VoiceConnectionState) => void;
}

const listeners = new Map<string, ActiveVoiceCommandListener>();
const activeCaptures = new Set<string>();
const recognitionNoticeAt = new Map<string, number>();
const activeNoticeChannels = new Set<string>();

function getCaptureKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

async function sendListenerNotice(
  guild: Guild,
  settings: GuildSettingsShape,
  embedTitle: string,
  description: string
): Promise<GuildTextBasedChannel | null> {
  const textChannel = await resolveVoiceCommandTextChannel(guild, settings);
  if (!textChannel) {
    logger.warn({ guildId: guild.id }, "Voice command notice skipped because no usable text channel is configured");
    return null;
  }

  await textChannel
    .send({ embeds: [embedTitle === "Voice Recognition Unavailable" ? errorEmbed(embedTitle, description) : infoEmbed(embedTitle, description)] })
    .catch((error: unknown) => {
      logger.warn({ err: error, guildId: guild.id, channelId: textChannel.id }, "Failed to send voice command listener notice");
    });

  return textChannel;
}

async function maybeSendRecognitionUnavailableNotice(guild: Guild, settings: GuildSettingsShape, reason: string): Promise<void> {
  const lastSent = recognitionNoticeAt.get(guild.id) ?? 0;
  if (Date.now() - lastSent < UNAVAILABLE_NOTICE_INTERVAL_MS) {
    return;
  }

  recognitionNoticeAt.set(guild.id, Date.now());
  await sendListenerNotice(guild, settings, "Voice Recognition Unavailable", reason);
}

function captureUserPcm(connection: VoiceConnection, userId: string): Promise<Buffer | null> {
  const env = loadEnv();
  const maxBytes = PCM_BYTES_PER_SECOND * env.VOICE_COMMANDS_MAX_AUDIO_SEC;
  const opusStream = connection.receiver.subscribe(userId, {
    end: {
      behavior: EndBehaviorType.AfterSilence,
      duration: env.VOICE_COMMANDS_SILENCE_MS
    }
  });
  const decoder = new prism.opus.Decoder({ rate: 48_000, channels: 2, frameSize: 960 });
  const chunks: Buffer[] = [];
  let byteCount = 0;
  let settled = false;

  return new Promise((resolve, reject) => {
    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      opusStream.destroy();
      decoder.destroy();

      if (byteCount < MIN_AUDIO_BYTES) {
        resolve(null);
        return;
      }

      resolve(Buffer.concat(chunks, byteCount));
    };

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      opusStream.destroy();
      decoder.destroy();
      reject(error);
    };

    const timeout = setTimeout(finish, env.VOICE_COMMANDS_MAX_AUDIO_SEC * 1_000);

    const collector = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        const remaining = maxBytes - byteCount;
        if (remaining <= 0) {
          callback();
          finish();
          return;
        }

        const usable = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
        chunks.push(Buffer.from(usable));
        byteCount += usable.length;

        callback();

        if (byteCount >= maxBytes) {
          finish();
        }
      }
    });

    opusStream.once("error", fail);
    decoder.once("error", fail);
    collector.once("error", fail);
    collector.once("finish", finish);
    collector.once("close", finish);
    decoder.once("end", finish);
    decoder.once("close", finish);
    opusStream.pipe(decoder).pipe(collector);
  });
}

async function fetchSpeakingMember(guild: Guild, userId: string): Promise<GuildMember | null> {
  const cached = guild.members.cache.get(userId);
  if (cached) {
    return cached;
  }

  return guild.members.fetch(userId).catch(() => null);
}

async function handleSpeakingStart(client: BotClient, guildId: string, connection: VoiceConnection, userId: string): Promise<void> {
  if (client.user?.id === userId) {
    return;
  }

  const captureKey = getCaptureKey(guildId, userId);
  if (activeCaptures.has(captureKey)) {
    return;
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    return;
  }

  const settings = await getGuildSettings(guildId);
  if (!settings.voiceCommands.enabled) {
    stopVoiceCommandListener(guildId);
    return;
  }

  const recognitionStatus = getVoiceRecognitionStatus();
  if (!recognitionStatus.ok) {
    await maybeSendRecognitionUnavailableNotice(guild, settings, recognitionStatus.reason ?? "Voice recognition is unavailable.");
    return;
  }

  const member = await fetchSpeakingMember(guild, userId);
  if (!member) {
    return;
  }

  const eligibility = await isVoiceCommandAudioEligible({ guild, member, settings });
  if (!eligibility.ok) {
    return;
  }

  const env = loadEnv();
  const transcriptionCooldown = checkAndSetCooldown(
    client.cooldowns,
    "voice:transcribe",
    userId,
    env.VOICE_COMMANDS_TRANSCRIPTION_COOLDOWN_SEC
  );
  if (!transcriptionCooldown.ok) {
    return;
  }

  activeCaptures.add(captureKey);
  let pcm: Buffer | null = null;

  try {
    pcm = await captureUserPcm(connection, userId);
    if (!pcm) {
      return;
    }

    const transcript = await transcribePcmAudio(pcm);
    await routeVoiceCommandTranscript({ client, guild, member, transcript, settings });
  } catch (error) {
    logger.warn({ err: error, guildId, userId }, "Failed to process voice command audio");
  } finally {
    pcm = null;
    activeCaptures.delete(captureKey);
  }
}

export function stopVoiceCommandListener(guildId: string): void {
  const active = listeners.get(guildId);
  if (!active) {
    return;
  }

  active.connection.receiver.speaking.off("start", active.speakingListener);
  active.connection.off("stateChange", active.stateListener);
  listeners.delete(guildId);
  activeNoticeChannels.delete(guildId);
  logger.info({ guildId }, "Voice command listener stopped");
}

export async function syncVoiceCommandListener(client: BotClient, guildId: string): Promise<void> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    stopVoiceCommandListener(guildId);
    return;
  }

  const settings = await getGuildSettings(guildId);
  const connection = getVoiceConnection(guildId);
  const botVoiceChannel = guild.members.me?.voice.channel;

  if (!settings.voiceCommands.enabled || !connection || !botVoiceChannel || connection.state.status === VoiceConnectionStatus.Destroyed) {
    stopVoiceCommandListener(guildId);
    return;
  }

  const existing = listeners.get(guildId);
  if (existing?.connection === connection) {
    return;
  }

  stopVoiceCommandListener(guildId);

  const speakingListener = (userId: string) => {
    void handleSpeakingStart(client, guildId, connection, userId);
  };

  const stateListener = (_oldState: VoiceConnectionState, newState: VoiceConnectionState) => {
    if (newState.status === VoiceConnectionStatus.Destroyed || !guild.members.me?.voice.channelId) {
      stopVoiceCommandListener(guildId);
    }
  };

  connection.receiver.speaking.on("start", speakingListener);
  connection.on("stateChange", stateListener);
  listeners.set(guildId, { connection, speakingListener, stateListener });

  logger.info({ guildId, voiceChannelId: botVoiceChannel.id }, "Voice command listener started");

  if (!activeNoticeChannels.has(guildId)) {
    const textChannel = await sendListenerNotice(
      guild,
      settings,
      "Voice Commands Active",
      `${VOICE_COMMAND_PRIVACY_NOTICE}\nListening is active in ${botVoiceChannel.toString()} until voice commands are disabled or bot7108 leaves voice.`
    );

    if (textChannel) {
      activeNoticeChannels.add(guildId);
    }
  }
}
