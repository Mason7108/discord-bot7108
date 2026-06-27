import { DisTube, Events, type Queue, type Song } from "distube";
import { SpotifyPlugin } from "@distube/spotify";
import { YouTubePlugin } from "@distube/youtube";
import { AudioPlayerStatus, VoiceConnectionStatus } from "@discordjs/voice";
import ffmpegStatic from "ffmpeg-static";
import { ChannelType, PermissionFlagsBits, type Client, type Guild, type GuildTextBasedChannel, type VoiceBasedChannel } from "discord.js";
import { existsSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CookieAwareYtDlpPlugin } from "./cookieAwareYtDlpPlugin.js";
import { Mp3AttachmentPlugin } from "./mp3AttachmentPlugin.js";
import { getGuildSettings } from "../services/guildSettingsService.js";
import { syncVoiceCommandListener } from "../../features/voiceCommands/listener.js";
import type { BotClient } from "../types.js";
import { logger } from "../../utils/logger.js";

type YouTubeCookie = {
  name: string;
  value: string;
  expirationDate?: number;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  hostOnly?: boolean;
  sameSite?: string;
};

const YOUTUBE_COOKIE_HOST = "www.youtube.com";
const DEFAULT_FFMPEG_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const DEFAULT_FFMPEG_REFERER = "https://www.youtube.com/";
const PLAYBACK_HEALTH_CHECK_DELAY_MS = 7_000;
const PLAYBACK_SHORT_FINISH_MS = 10_000;
const MUSIC_IDLE_DISCONNECT_MS = 2 * 60 * 1_000;
const MUSIC_IDLE_SWEEP_MS = 15_000;
const playbackWarnings = new Set<string>();
const playbackStarts = new Map<string, { startedAt: number; songId: string; songUrl?: string; songName?: string }>();
const recentFfmpegLogs = new Map<string, string[]>();
const musicIdleDisconnectTimers = new Map<string, NodeJS.Timeout>();
const musicIdleContexts = new Map<string, MusicIdleContext>();

type MusicIdleContext = {
  guildId: string;
  voiceChannelId?: string;
  textChannelId?: string;
};

function createFfmpegInputArgs(): Record<string, string> {
  const userAgent = process.env.FFMPEG_USER_AGENT || process.env.YTDLP_USER_AGENT || DEFAULT_FFMPEG_USER_AGENT;
  const referer = process.env.FFMPEG_REFERER || DEFAULT_FFMPEG_REFERER;
  const proxy = process.env.FFMPEG_PROXY || process.env.YTDLP_PROXY || process.env.YOUTUBE_PROXY;
  const headers = [
    `Referer: ${referer}`,
    "Accept: */*",
    "Accept-Language: en-US,en;q=0.9"
  ];

  return {
    user_agent: userAgent,
    headers: `${headers.join("\r\n")}\r\n`,
    reconnect_on_http_error: "4xx,5xx",
    ...(proxy ? { http_proxy: proxy } : {})
  };
}

function resolveFfmpegPath(): string {
  if (process.env.FFMPEG_PATH) {
    return process.env.FFMPEG_PATH;
  }

  // The ffmpeg-static Linux binary can segfault on Railway/Nixpacks while
  // reading remote YouTube streams. Prefer the system package there.
  if (process.platform === "linux") {
    const candidates = [
      "/usr/bin/ffmpeg",
      "/usr/local/bin/ffmpeg",
      "/nix/var/nix/profiles/default/bin/ffmpeg",
      "/nix/var/nix/profiles/default/sw/bin/ffmpeg",
      "/bin/ffmpeg"
    ];
    const existing = candidates.find((candidate) => existsSync(candidate));

    if (existing) {
      logger.info(`Resolved system ffmpeg at ${existing}`);
      return existing;
    }

    logger.warn(
      `No system ffmpeg found in expected Linux paths: ${candidates.join(", ")}. ` +
        "Railway should install it through railpack.json deploy.aptPackages or RAILPACK_DEPLOY_APT_PACKAGES=ffmpeg."
    );
    return "ffmpeg";
  }

  return typeof ffmpegStatic === "string" ? ffmpegStatic : "ffmpeg";
}

function parseYouTubeCookies(): YouTubeCookie[] | undefined {
  const source = process.env.YOUTUBE_COOKIES ?? process.env.YOUTUBE_COOKIES_JSON;
  const encodedSource = process.env.YOUTUBE_COOKIES_BASE64;

  if (!source && !encodedSource) {
    return undefined;
  }

  try {
    const raw = source ?? Buffer.from(encodedSource ?? "", "base64").toString("utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (
      !Array.isArray(parsed) ||
      !parsed.every((cookie) => {
        return (
          cookie &&
          typeof cookie === "object" &&
          typeof (cookie as YouTubeCookie).name === "string" &&
          typeof (cookie as YouTubeCookie).value === "string"
        );
      })
    ) {
      logger.warn("Ignoring YouTube cookies because the value is not a cookie JSON array.");
      return undefined;
    }

    logger.info({ cookieCount: parsed.length }, "Loaded YouTube cookies for music playback");
    return parsed as YouTubeCookie[];
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : error }, "Ignoring invalid YouTube cookies configuration");
    return undefined;
  }
}

function cookieDomainMatchesHost(cookie: YouTubeCookie, host: string): boolean {
  const domain = sanitizeCookieField(cookie.domain || ".youtube.com")
    .replace(/^\./, "")
    .toLowerCase();
  const normalizedHost = host.toLowerCase();

  return normalizedHost === domain || normalizedHost.endsWith(`.${domain}`);
}

function filterYouTubePluginCookies(cookies: YouTubeCookie[] | undefined): YouTubeCookie[] | undefined {
  if (!cookies?.length) {
    return undefined;
  }

  const filtered = cookies.filter((cookie) => cookieDomainMatchesHost(cookie, YOUTUBE_COOKIE_HOST));
  const droppedCount = cookies.length - filtered.length;

  if (droppedCount > 0) {
    logger.info({ droppedCount, keptCount: filtered.length }, "Filtered non-YouTube cookies before creating YouTube plugin");
  }

  if (filtered.length === 0) {
    logger.warn("No cookies matched www.youtube.com for the YouTube plugin; continuing with yt-dlp cookies only.");
    return undefined;
  }

  return filtered;
}

function createYouTubePlugin(cookies: YouTubeCookie[] | undefined): YouTubePlugin {
  try {
    return new YouTubePlugin({ cookies });
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : error }, "Ignoring YouTube plugin cookies because they could not be loaded");
    return new YouTubePlugin();
  }
}

function toNetscapeBoolean(value: boolean | undefined): "TRUE" | "FALSE" {
  return value ? "TRUE" : "FALSE";
}

function sanitizeCookieField(value: unknown): string {
  return String(value ?? "").replace(/[\t\r\n]/g, "");
}

function writeYtDlpCookieFile(cookies: YouTubeCookie[] | undefined): string | undefined {
  if (!cookies?.length) {
    return undefined;
  }

  const cookieFilePath = path.join(os.tmpdir(), "bot7108-youtube-cookies.txt");
  const lines = [
    "# Netscape HTTP Cookie File",
    ...cookies.map((cookie) => {
      const domain = sanitizeCookieField(cookie.domain || ".youtube.com");
      const includeSubdomains = toNetscapeBoolean(!cookie.hostOnly || domain.startsWith("."));
      const pathValue = sanitizeCookieField(cookie.path || "/");
      const secure = toNetscapeBoolean(cookie.secure);
      const expires = Number.isFinite(cookie.expirationDate) ? String(Math.floor(cookie.expirationDate ?? 0)) : "0";
      const name = sanitizeCookieField(cookie.name);
      const value = sanitizeCookieField(cookie.value);

      return [domain, includeSubdomains, pathValue, secure, expires, name, value].join("\t");
    })
  ];

  writeFileSync(cookieFilePath, `${lines.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
  logger.info({ cookieCount: cookies.length }, "Prepared YouTube cookie file for yt-dlp");

  return cookieFilePath;
}

function formatDisTubeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    const compactMessage = error.message.replace(/\s+/g, " ").trim();
    if (compactMessage.includes("Sign in to confirm you're not a bot")) {
      return "YouTube is blocking anonymous playback. Set YOUTUBE_COOKIES_BASE64 in the bot host with exported YouTube cookies.";
    }
    if (compactMessage.includes("Cannot play audio as no valid encryption package is installed")) {
      return "Discord voice encryption is missing. Run npm install so @noble/ciphers is installed, then redeploy/restart the bot.";
    }
    if (compactMessage.includes("ffmpeg exited with code")) {
      return "FFmpeg could not decode the stream. The YouTube media URL may be blocked or expired; try again, refresh YOUTUBE_COOKIES_BASE64, or set YTDLP_PROXY/YOUTUBE_PROXY.";
    }

    return compactMessage.length > 240 ? `${compactMessage.slice(0, 240)}...` : compactMessage;
  }

  return "Unknown playback error.";
}

function compactDetails(details: Record<string, unknown>): string {
  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

function sanitizeDiagnosticLine(line: string): string {
  return line
    .replace(/(Cookie:\s*)[^\r\n]+/gi, "$1<redacted>")
    .replace(/(Authorization:\s*)[^\r\n]+/gi, "$1<redacted>")
    .replace(/https?:\/\/\S+/g, "<redacted-url>")
    .slice(0, 500);
}

function getGuildIdFromDisTubeDebug(message: string): string | undefined {
  return /^\[([^\]]+)\]/.exec(message)?.[1];
}

function rememberFfmpegLog(message: string): void {
  const guildId = getGuildIdFromDisTubeDebug(message);
  if (!guildId) {
    return;
  }

  const lines = recentFfmpegLogs.get(guildId) ?? [];
  lines.push(sanitizeDiagnosticLine(message));
  recentFfmpegLogs.set(guildId, lines.slice(-8));
}

function recentFfmpegSummary(guildId: string): string | undefined {
  const lines = recentFfmpegLogs.get(guildId);
  if (!lines?.length) {
    return undefined;
  }

  return lines.slice(-4).join(" | ");
}

function warnOnce(queue: Queue, key: string, message: string, details: Record<string, unknown>): void {
  const scopedKey = `${queue.id}:${key}`;
  if (playbackWarnings.has(scopedKey)) {
    return;
  }

  playbackWarnings.add(scopedKey);
  const mergedDetails = {
    guildId: queue.id,
    ...details,
    ffmpegRecent: recentFfmpegSummary(queue.id)
  };
  logger.warn(`Music playback health check failed (${key}): ${compactDetails(mergedDetails)}`);
  void queue.textChannel?.send({ content: message });
}

function currentSongStillPlaying(queue: Queue, song: Song): boolean {
  const current = queue.songs[0];
  return Boolean(current && current.id === song.id && current.url === song.url);
}

function rememberPlaybackStart(queue: Queue, song: Song): void {
  playbackStarts.set(queue.id, {
    startedAt: Date.now(),
    songId: song.id,
    songUrl: song.url,
    songName: song.name
  });
}

function forgetPlaybackStart(queue: Queue): void {
  playbackStarts.delete(queue.id);
}

function samePlayback(song: Song, playback: { songId: string; songUrl?: string }): boolean {
  return song.id === playback.songId && song.url === playback.songUrl;
}

function warnIfPlaybackEndedTooSoon(queue: Queue, song?: Song): void {
  const playback = playbackStarts.get(queue.id);
  if (!playback) {
    return;
  }

  if (song && !samePlayback(song, playback)) {
    return;
  }

  const elapsedMs = Date.now() - playback.startedAt;
  if (elapsedMs > PLAYBACK_SHORT_FINISH_MS) {
    forgetPlaybackStart(queue);
    return;
  }

  const playbackDurationSec = queue.voice.playbackDuration;
  const details = {
    song: song?.name ?? playback.songName,
    elapsedMs,
    playbackDurationSec,
    playerStatus: queue.voice.audioPlayer.state.status,
    connectionStatus: queue.voice.connection.state.status,
    ping: queue.voice.connection.ping,
    ffmpegRecent: recentFfmpegSummary(queue.id)
  };
  const ffmpegSummary = recentFfmpegSummary(queue.id);
  const diagnosticMessage = [
    "Music diagnostic: the queue ended almost immediately after `Now playing`, so commands like `/volume` see `No active queue`. This usually means FFmpeg could not read usable audio from the extracted stream. Check Railway logs for FFmpeg/yt-dlp output, refresh `YOUTUBE_COOKIES_BASE64`, or try `YTDLP_PROXY`/`YOUTUBE_PROXY`.",
    ffmpegSummary ? `Recent FFmpeg: ${ffmpegSummary}` : undefined
  ]
    .filter(Boolean)
    .join("\n");

  warnOnce(
    queue,
    "short-finish",
    diagnosticMessage,
    details
  );
  forgetPlaybackStart(queue);
}

function clearMusicIdleDisconnect(guildId: string): void {
  const existing = musicIdleDisconnectTimers.get(guildId);
  if (!existing) {
    return;
  }

  clearTimeout(existing);
  musicIdleDisconnectTimers.delete(guildId);
}

function rememberMusicIdleContext(context: MusicIdleContext): void {
  if (!context.voiceChannelId && !context.textChannelId) {
    return;
  }

  musicIdleContexts.set(context.guildId, {
    ...musicIdleContexts.get(context.guildId),
    ...context
  });
}

function clearMusicIdleTracking(guildId: string): void {
  clearMusicIdleDisconnect(guildId);
  musicIdleContexts.delete(guildId);
}

function canSendIdleNotice(channel: GuildTextBasedChannel): boolean {
  const botMember = channel.guild.members.me;
  const permissions = botMember ? channel.permissionsFor(botMember) : null;

  return Boolean(permissions?.has(PermissionFlagsBits.SendMessages));
}

function resolveIdleNoticeChannel(
  guild: Guild,
  voiceChannel: VoiceBasedChannel,
  fallbackTextChannelId?: string
): GuildTextBasedChannel | null {
  if (voiceChannel.isTextBased() && canSendIdleNotice(voiceChannel as GuildTextBasedChannel)) {
    return voiceChannel as GuildTextBasedChannel;
  }

  const fallbackChannel = fallbackTextChannelId ? guild.channels.cache.get(fallbackTextChannelId) : null;
  if (fallbackChannel?.isTextBased() && !fallbackChannel.isDMBased() && canSendIdleNotice(fallbackChannel)) {
    return fallbackChannel;
  }

  return null;
}

async function sendIdleDisconnectNotice(guild: Guild, voiceChannel: VoiceBasedChannel, textChannelId?: string): Promise<void> {
  const noticeChannel = resolveIdleNoticeChannel(guild, voiceChannel, textChannelId);
  if (!noticeChannel) {
    logger.warn({ guildId: guild.id, voiceChannelId: voiceChannel.id }, "Could not send music idle disconnect notice");
    return;
  }

  await noticeChannel
    .send({
      content: "No music detected after 2 minutes. bot7108 is now leaving. To play music again, use `/play`."
    })
    .catch((error: unknown) => {
      logger.warn(
        { err: error, guildId: guild.id, channelId: noticeChannel.id },
        "Failed to send music idle disconnect notice"
      );
    });
}

function createMusicIdleContext(queue: Queue): MusicIdleContext {
  return {
    guildId: queue.id,
    voiceChannelId: queue.clientMember?.voice.channelId ?? queue.voiceChannel?.id,
    textChannelId: queue.textChannel?.id
  };
}

function scheduleMusicIdleDisconnect(distube: DisTube, queue: Queue): void {
  const context = createMusicIdleContext(queue);
  rememberMusicIdleContext(context);

  scheduleMusicIdleDisconnectFromContext(distube, context);
}

function scheduleMusicIdleDisconnectFromContext(distube: DisTube, context: MusicIdleContext): void {
  if (!context.voiceChannelId) {
    logger.warn({ guildId: context.guildId }, "Skipping music idle disconnect because no voice channel was captured");
    return;
  }

  clearMusicIdleDisconnect(context.guildId);

  const timer = setTimeout(() => {
    void disconnectIfMusicIdle(distube, context);
  }, MUSIC_IDLE_DISCONNECT_MS);

  timer.unref();
  musicIdleDisconnectTimers.set(context.guildId, timer);
}

function queueHasActiveMusic(queue: Queue | undefined): boolean {
  if (!queue) {
    return false;
  }

  const playerStatus = queue.voice.audioPlayer.state.status;
  return playerStatus === AudioPlayerStatus.Playing || playerStatus === AudioPlayerStatus.Buffering;
}

function sweepMusicIdleVoiceConnections(distube: DisTube): void {
  for (const guild of distube.client.guilds.cache.values()) {
    const voiceChannel = guild.members.me?.voice.channel;

    if (!voiceChannel) {
      clearMusicIdleTracking(guild.id);
      continue;
    }

    const queue = distube.getQueue(guild.id);
    if (queueHasActiveMusic(queue)) {
      clearMusicIdleDisconnect(guild.id);
      rememberMusicIdleContext(createMusicIdleContext(queue as Queue));
      continue;
    }

    if (musicIdleDisconnectTimers.has(guild.id)) {
      continue;
    }

    const context = {
      guildId: guild.id,
      voiceChannelId: voiceChannel.id,
      textChannelId: musicIdleContexts.get(guild.id)?.textChannelId
    };
    rememberMusicIdleContext(context);
    scheduleMusicIdleDisconnectFromContext(distube, context);
  }
}

function startMusicIdleSweep(distube: DisTube): void {
  const timer = setInterval(() => {
    sweepMusicIdleVoiceConnections(distube);
  }, MUSIC_IDLE_SWEEP_MS);

  timer.unref();
}

async function disconnectIfMusicIdle(distube: DisTube, context: MusicIdleContext): Promise<void> {
  clearMusicIdleDisconnect(context.guildId);

  const activeQueue = distube.getQueue(context.guildId);
  if (queueHasActiveMusic(activeQueue)) {
    return;
  }

  let settings: Awaited<ReturnType<typeof getGuildSettings>>;
  try {
    settings = await getGuildSettings(context.guildId);
  } catch (error) {
    logger.warn({ err: error, guildId: context.guildId }, "Skipping music idle disconnect because settings could not be loaded");
    return;
  }

  if (settings.music247Enabled) {
    return;
  }

  const guild = distube.client.guilds.cache.get(context.guildId);
  if (!guild) {
    logger.warn({ guildId: context.guildId }, "Skipping music idle disconnect because guild was not cached");
    return;
  }

  const currentVoiceChannel = guild.members.me?.voice.channel;
  if (!currentVoiceChannel || currentVoiceChannel.id !== context.voiceChannelId) {
    return;
  }

  await sendIdleDisconnectNotice(guild, currentVoiceChannel, context.textChannelId);
  distube.voices.leave(context.guildId);
  clearMusicIdleTracking(context.guildId);
  logger.info({ guildId: context.guildId, voiceChannelId: currentVoiceChannel.id }, "Disconnected from idle music voice channel");
}

function schedulePlaybackHealthCheck(queue: Queue, song: Song): void {
  const timer = setTimeout(() => {
    checkPlaybackHealth(queue, song);
  }, PLAYBACK_HEALTH_CHECK_DELAY_MS);

  timer.unref();
}

function checkPlaybackHealth(queue: Queue, song: Song): void {
  if (!currentSongStillPlaying(queue, song)) {
    return;
  }

  const botVoice = queue.clientMember?.voice;
  const voiceChannel = queue.voiceChannel;
  const playerStatus = queue.voice.audioPlayer.state.status;
  const connectionStatus = queue.voice.connection.state.status;
  const playbackDurationSec = queue.voice.playbackDuration;
  const ping = queue.voice.connection.ping;
  const details = {
    song: song.name,
    playerStatus,
    connectionStatus,
    playbackDurationSec,
    ping,
    voiceChannelId: voiceChannel?.id,
    voiceChannelType: voiceChannel?.type,
    serverMute: botVoice?.serverMute,
    selfMute: botVoice?.selfMute,
    suppress: botVoice?.suppress
  };

  if (botVoice?.serverMute || botVoice?.selfMute) {
    warnOnce(
      queue,
      "muted",
      "Music diagnostic: I started the player, but I am muted in the voice channel. Unmute the bot, then run `/play` again.",
      details
    );
    return;
  }

  if (voiceChannel?.type === ChannelType.GuildStageVoice || botVoice?.suppress) {
    warnOnce(
      queue,
      "stage-suppressed",
      "Music diagnostic: I am in a Stage channel or suppressed as a listener. Move me to a normal voice channel or make me a speaker.",
      details
    );
    return;
  }

  if (connectionStatus !== VoiceConnectionStatus.Ready) {
    warnOnce(
      queue,
      "voice-not-ready",
      `Music diagnostic: the Discord voice connection is \`${connectionStatus}\`, not \`ready\`. Rejoin the voice channel and try again.`,
      details
    );
    return;
  }

  if (playerStatus === AudioPlayerStatus.Buffering || playbackDurationSec < 1) {
    warnOnce(
      queue,
      "no-audio-frames",
      "Music diagnostic: the player started, but no audio frames reached Discord after a few seconds. Check the deploy logs for FFmpeg/yt-dlp errors, then refresh YouTube cookies or try a proxy if YouTube is blocking the host.",
      details
    );
    return;
  }

  if (playerStatus !== AudioPlayerStatus.Playing) {
    warnOnce(
      queue,
      "player-not-playing",
      `Music diagnostic: the audio player is \`${playerStatus}\`, not \`playing\`. Try \`/stop\`, then run \`/play\` again.`,
      details
    );
    return;
  }

  if (ping.udp === undefined || ping.udp === null) {
    warnOnce(
      queue,
      "udp-missing",
      "Music diagnostic: audio frames are being produced, but Discord voice UDP has no ping. Discord voice needs UDP; if this is hosted on Railway or another web-app host, move the bot to a VPS/host with reliable Discord voice UDP or use a Lavalink node there.",
      details
    );
  }
}

function attachVoiceDebugLogging(queue: Queue): void {
  queue.voice.connection.on("debug", (message) => {
    logger.debug({ guildId: queue.id, source: "voiceConnection" }, message);
  });

  queue.voice.connection.on("stateChange", (oldState, newState) => {
    logger.debug(
      {
        guildId: queue.id,
        oldStatus: oldState.status,
        newStatus: newState.status,
        ping: queue.voice.connection.ping
      },
      "Discord voice connection state changed"
    );
  });

  queue.voice.audioPlayer.on("stateChange", (oldState, newState) => {
    logger.debug(
      {
        guildId: queue.id,
        oldStatus: oldState.status,
        newStatus: newState.status,
        playbackDurationSec: queue.voice.playbackDuration
      },
      "Discord audio player state changed"
    );
  });
}

export async function createDisTube(client: Client): Promise<DisTube> {
  const ffmpegPath = resolveFfmpegPath();
  const youtubeCookies = parseYouTubeCookies();
  const ytDlpCookieFile = writeYtDlpCookieFile(youtubeCookies);
  const youtubePluginCookies = filterYouTubePluginCookies(youtubeCookies);

  const distube = new DisTube(client as never, {
    ffmpeg: {
      path: ffmpegPath,
      args: {
        input: createFfmpegInputArgs()
      }
    },
    emitNewSongOnly: true,
    plugins: [
      new SpotifyPlugin(),
      new Mp3AttachmentPlugin(),
      new CookieAwareYtDlpPlugin(ytDlpCookieFile),
      createYouTubePlugin(youtubePluginCookies)
    ] as never
  });

  distube.on(Events.DEBUG, (message: string) => {
    logger.debug({ source: "distube" }, message);
  });

  distube.on(Events.FFMPEG_DEBUG, (message: string) => {
    const sanitizedMessage = sanitizeDiagnosticLine(message);
    rememberFfmpegLog(message);
    logger.debug({ source: "ffmpeg" }, sanitizedMessage);
  });

  distube.on(Events.INIT_QUEUE, (queue: Queue) => {
    clearMusicIdleDisconnect(queue.id);
    rememberMusicIdleContext(createMusicIdleContext(queue));
    attachVoiceDebugLogging(queue);
    void syncVoiceCommandListener(client as BotClient, queue.id).catch((error: unknown) => {
      logger.warn({ err: error, guildId: queue.id }, "Failed to sync voice command listener after queue init");
    });
  });

  distube.on(Events.PLAY_SONG, (queue: Queue, song: Song) => {
    clearMusicIdleDisconnect(queue.id);
    rememberMusicIdleContext(createMusicIdleContext(queue));
    void queue.textChannel?.send({
      content: `Now playing: **${song.name}** - \`${song.formattedDuration}\``
    });
    rememberPlaybackStart(queue, song);
    schedulePlaybackHealthCheck(queue, song);
  });

  distube.on(Events.ADD_SONG, (queue: Queue, song: Song) => {
    clearMusicIdleDisconnect(queue.id);
    rememberMusicIdleContext(createMusicIdleContext(queue));
    void queue.textChannel?.send({ content: `Queued: **${song.name}**` });
  });

  distube.on(Events.ERROR, (error: Error, queue: Queue, song?: Song) => {
    const reason = formatDisTubeError(error);
    const ffmpegSummary = recentFfmpegSummary(queue.id);
    const diagnostic = ffmpegSummary ? `\nRecent FFmpeg: ${ffmpegSummary}` : "";
    logger.error({ err: error, guildId: queue.id, song: song?.name, ffmpegRecent: ffmpegSummary }, "DisTube error");
    forgetPlaybackStart(queue);

    void queue.textChannel?.send({
      content: `Playback error${song?.name ? ` for **${song.name}**` : ""}: ${reason}${diagnostic}`
    });
  });

  distube.on(Events.FINISH_SONG, (queue: Queue, song: Song) => {
    warnIfPlaybackEndedTooSoon(queue, song);
  });

  distube.on(Events.DELETE_QUEUE, (queue: Queue) => {
    warnIfPlaybackEndedTooSoon(queue);
    forgetPlaybackStart(queue);
    scheduleMusicIdleDisconnect(distube, queue);
  });

  distube.on(Events.DISCONNECT, (queue: Queue) => {
    clearMusicIdleTracking(queue.id);
  });

  distube.on(Events.FINISH, (queue: Queue) => {
    scheduleMusicIdleDisconnect(distube, queue);
  });

  logger.info(`DisTube initialized with ffmpegPath=${ffmpegPath}`);
  startMusicIdleSweep(distube);

  return distube;
}
