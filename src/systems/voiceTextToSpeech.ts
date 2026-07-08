import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  type AudioPlayer,
  type VoiceConnection
} from "@discordjs/voice";
import { ChannelType, PermissionFlagsBits, type GuildMember, type Message, type VoiceChannel } from "discord.js";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { BotClient, GuildSettingsShape } from "../core/types.js";
import { logger } from "../utils/logger.js";

interface VoiceTextToSpeechConfig {
  enginePath: string;
  voice: string;
  speed: number;
  pitch: number;
  maxChars: number;
  queueLimit: number;
}

interface VoiceTextToSpeechItem {
  guildId: string;
  channelId: string;
  text: string;
  requestedById: string;
  voiceChannel: VoiceChannel;
}

interface GuildVoiceTextToSpeechState {
  queue: VoiceTextToSpeechItem[];
  processing: boolean;
  connectionOwnedByTts: boolean;
  disconnectTimer?: NodeJS.Timeout;
  player?: AudioPlayer;
}

const guildStates = new Map<string, GuildVoiceTextToSpeechState>();
const noticeCooldowns = new Map<string, number>();
const NOTICE_COOLDOWN_MS = 60_000;
const IDLE_DISCONNECT_MS = 10_000;

function numberFromEnv(name: string, defaultValue: number, min: number, max: number): number {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export function getVoiceTextToSpeechConfig(): VoiceTextToSpeechConfig {
  return {
    enginePath: process.env.VC_TTS_ENGINE_PATH?.trim() || "espeak-ng",
    voice: process.env.VC_TTS_VOICE?.trim() || "en-us",
    speed: numberFromEnv("VC_TTS_SPEED", 165, 80, 260),
    pitch: numberFromEnv("VC_TTS_PITCH", 50, 0, 99),
    maxChars: numberFromEnv("VC_TTS_MAX_CHARS", 220, 1, 500),
    queueLimit: numberFromEnv("VC_TTS_QUEUE_LIMIT", 5, 1, 20)
  };
}

export function isVoiceTextToSpeechMessageChannel(channel: Message["channel"]): channel is VoiceChannel {
  return channel.type === ChannelType.GuildVoice;
}

export function normalizeVoiceTextToSpeechText(input: string, maxChars = getVoiceTextToSpeechConfig().maxChars): string {
  const normalized = input
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<a?:([a-zA-Z0-9_]+):\d+>/g, " $1 ")
    .replace(/https?:\/\/\S+/gi, " link ")
    .replace(/@everyone/gi, "everyone")
    .replace(/@here/gi, "here")
    .replace(/[*_~>|#()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(1, maxChars - 3)).trimEnd()}...`;
}

export async function getVoiceTextToSpeechEngineStatus(): Promise<{ ok: boolean; reason?: string }> {
  const config = getVoiceTextToSpeechConfig();

  return new Promise((resolve) => {
    const child = spawn(config.enginePath, ["--version"], {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true
    });
    let settled = false;
    let stderr = "";

    const settle = (result: { ok: boolean; reason?: string }) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      settle({
        ok: false,
        reason: `TTS engine \`${config.enginePath}\` is unavailable: ${error.message}`
      });
    });
    child.once("close", (code) => {
      if (code === 0) {
        settle({ ok: true });
        return;
      }

      settle({
        ok: false,
        reason: `TTS engine \`${config.enginePath}\` exited with code ${code ?? "unknown"}.${
          stderr.trim() ? ` ${stderr.trim()}` : ""
        }`
      });
    });
  });
}

function getGuildState(guildId: string): GuildVoiceTextToSpeechState {
  const existing = guildStates.get(guildId);
  if (existing) {
    return existing;
  }

  const created: GuildVoiceTextToSpeechState = {
    queue: [],
    processing: false,
    connectionOwnedByTts: false
  };
  guildStates.set(guildId, created);
  return created;
}

function hasActiveMusicQueue(client: BotClient, guildId: string): boolean {
  const queue = client.distube?.getQueue(guildId);
  return Boolean(queue && Array.isArray(queue.songs) && queue.songs.length > 0);
}

function getMissingBotVoicePermissions(voiceChannel: VoiceChannel, botMember: GuildMember | null | undefined): string[] {
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
  if (!permissions.has(PermissionFlagsBits.UseVAD)) {
    missing.push("UseVAD");
  }

  return missing;
}

async function sendLimitedNotice(voiceChannel: VoiceChannel, key: string, content: string): Promise<void> {
  const cooldownKey = `${voiceChannel.guild.id}:${voiceChannel.id}:${key}`;
  const now = Date.now();
  const lastSentAt = noticeCooldowns.get(cooldownKey) ?? 0;
  if (now - lastSentAt < NOTICE_COOLDOWN_MS) {
    return;
  }

  noticeCooldowns.set(cooldownKey, now);
  await voiceChannel.send({ content }).catch((error: unknown) => {
    logger.warn({ err: error, guildId: voiceChannel.guild.id, channelId: voiceChannel.id }, "Failed to send VC TTS notice");
  });
}

async function getMessageAuthorMember(message: Message<true>): Promise<GuildMember | null> {
  if (message.member) {
    return message.member;
  }

  return message.guild.members.fetch(message.author.id).catch((error: unknown) => {
    logger.warn({ err: error, guildId: message.guild.id, userId: message.author.id }, "Failed to fetch VC TTS author member");
    return null;
  });
}

function clearIdleDisconnect(state: GuildVoiceTextToSpeechState): void {
  if (!state.disconnectTimer) {
    return;
  }

  clearTimeout(state.disconnectTimer);
  state.disconnectTimer = undefined;
}

function scheduleIdleDisconnect(client: BotClient, guildId: string): void {
  const state = getGuildState(guildId);
  clearIdleDisconnect(state);

  if (!state.connectionOwnedByTts) {
    return;
  }

  state.disconnectTimer = setTimeout(() => {
    const latest = guildStates.get(guildId);
    if (!latest || latest.processing || latest.queue.length > 0 || hasActiveMusicQueue(client, guildId)) {
      return;
    }

    getVoiceConnection(guildId)?.destroy();
    latest.connectionOwnedByTts = false;
    latest.player = undefined;
  }, IDLE_DISCONNECT_MS);
}

async function ensureVoiceConnection(item: VoiceTextToSpeechItem, state: GuildVoiceTextToSpeechState): Promise<VoiceConnection> {
  const existingConnection = getVoiceConnection(item.guildId);

  if (existingConnection) {
    const connectedChannelId = existingConnection.joinConfig.channelId;
    if (connectedChannelId && connectedChannelId !== item.channelId) {
      throw new Error("Bot is already connected to another voice channel.");
    }

    return existingConnection;
  }

  state.connectionOwnedByTts = true;
  const connection = joinVoiceChannel({
    channelId: item.channelId,
    guildId: item.guildId,
    adapterCreator: item.voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
  return connection;
}

async function spawnSpeechProcess(text: string, config: VoiceTextToSpeechConfig): Promise<ChildProcessWithoutNullStreams> {
  const child = spawn(
    config.enginePath,
    ["--stdout", "-v", config.voice, "-s", String(config.speed), "-p", String(config.pitch)],
    {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    }
  );

  await new Promise<void>((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });

  child.stdin.end(text);
  return child;
}

function speechTimeoutMs(text: string): number {
  return Math.min(45_000, Math.max(10_000, text.length * 120));
}

async function waitForSpeechPlayback(player: AudioPlayer, child: ChildProcessWithoutNullStreams, text: string): Promise<void> {
  let playerIdle = false;
  let childClosed = false;
  let childFailure: Error | undefined;
  let stderr = "";

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      rejectOnce(new Error("TTS playback timed out."));
    }, speechTimeoutMs(text));

    const cleanup = () => {
      clearTimeout(timeout);
      player.off("error", rejectOnce);
      player.off(AudioPlayerStatus.Idle, onPlayerIdle);
      child.off("error", rejectOnce);
      child.off("close", onChildClose);
    };

    const resolveOnce = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve();
    };

    function rejectOnce(error: Error) {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (!child.killed) {
        child.kill("SIGKILL");
      }
      reject(error);
    }

    function maybeFinish() {
      if (!playerIdle || !childClosed) {
        return;
      }

      if (childFailure) {
        rejectOnce(childFailure);
        return;
      }

      resolveOnce();
    }

    function onPlayerIdle() {
      playerIdle = true;
      maybeFinish();
    }

    function onChildClose(code: number | null, signal: NodeJS.Signals | null) {
      childClosed = true;
      if (code !== 0) {
        childFailure = new Error(
          `TTS engine exited with code ${code ?? "unknown"}${signal ? ` and signal ${signal}` : ""}.${
            stderr.trim() ? ` ${stderr.trim()}` : ""
          }`
        );
      }
      maybeFinish();
    }

    player.once("error", rejectOnce);
    player.once(AudioPlayerStatus.Idle, onPlayerIdle);
    child.once("error", rejectOnce);
    child.once("close", onChildClose);
  });
}

async function playVoiceTextToSpeechItem(client: BotClient, item: VoiceTextToSpeechItem, state: GuildVoiceTextToSpeechState): Promise<void> {
  if (hasActiveMusicQueue(client, item.guildId)) {
    return;
  }

  const config = getVoiceTextToSpeechConfig();
  const connection = await ensureVoiceConnection(item, state);
  const player =
    state.player ??
    createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Stop
      }
    });

  state.player = player;
  connection.subscribe(player);

  const child = await spawnSpeechProcess(item.text, config);
  const resource = createAudioResource(child.stdout, { inputType: StreamType.Arbitrary });
  player.play(resource);
  await waitForSpeechPlayback(player, child, item.text);
}

async function drainVoiceTextToSpeechQueue(client: BotClient, guildId: string): Promise<void> {
  const state = getGuildState(guildId);
  if (state.processing) {
    return;
  }

  state.processing = true;
  clearIdleDisconnect(state);

  try {
    while (state.queue.length > 0) {
      const item = state.queue.shift();
      if (!item) {
        continue;
      }

      await playVoiceTextToSpeechItem(client, item, state).catch((error: unknown) => {
        logger.warn(
          { err: error, guildId: item.guildId, channelId: item.channelId, userId: item.requestedById },
          "Failed to play VC TTS message"
        );
      });
    }
  } finally {
    state.processing = false;
    scheduleIdleDisconnect(client, guildId);
  }
}

export function stopVoiceTextToSpeech(guildId: string): void {
  const state = guildStates.get(guildId);
  if (!state) {
    return;
  }

  clearIdleDisconnect(state);
  state.queue = [];
  state.player?.stop(true);
  if (state.connectionOwnedByTts) {
    getVoiceConnection(guildId)?.destroy();
  }
  guildStates.delete(guildId);
}

export async function processVoiceTextToSpeechMessage(
  client: BotClient,
  message: Message,
  settings: GuildSettingsShape
): Promise<void> {
  if (!message.inGuild() || message.author.bot || !settings.modules.music || !settings.voiceTextToSpeech.enabled) {
    return;
  }

  if (!isVoiceTextToSpeechMessageChannel(message.channel)) {
    return;
  }

  if (hasActiveMusicQueue(client, message.guild.id)) {
    return;
  }

  const member = await getMessageAuthorMember(message);
  if (!member || member.voice.channelId !== message.channel.id) {
    return;
  }

  const botVoiceChannelId = message.guild.members.me?.voice.channelId;
  if (botVoiceChannelId && botVoiceChannelId !== message.channel.id) {
    return;
  }

  const missingPermissions = getMissingBotVoicePermissions(message.channel, message.guild.members.me);
  if (missingPermissions.length > 0) {
    await sendLimitedNotice(
      message.channel,
      "missing-permissions",
      `I need ${missingPermissions.map((permission) => `\`${permission}\``).join(", ")} in this voice channel to read VC chat aloud.`
    );
    return;
  }

  const config = getVoiceTextToSpeechConfig();
  const text = normalizeVoiceTextToSpeechText(message.cleanContent || message.content, config.maxChars);
  if (!text) {
    return;
  }

  const state = getGuildState(message.guild.id);
  if (state.queue.length >= config.queueLimit) {
    await sendLimitedNotice(message.channel, "queue-full", "VC text-to-speech is busy. Try again in a moment.");
    return;
  }

  state.queue.push({
    guildId: message.guild.id,
    channelId: message.channel.id,
    text,
    requestedById: message.author.id,
    voiceChannel: message.channel
  });

  void drainVoiceTextToSpeechQueue(client, message.guild.id);
}
