import { DisTube, Events, type Queue, type Song } from "distube";
import { SpotifyPlugin } from "@distube/spotify";
import { YouTubePlugin } from "@distube/youtube";
import { AudioPlayerStatus, VoiceConnectionStatus } from "@discordjs/voice";
import ffmpegStatic from "ffmpeg-static";
import { ChannelType, type Client } from "discord.js";
import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CookieAwareYtDlpPlugin } from "./cookieAwareYtDlpPlugin.js";
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
const playbackWarnings = new Set<string>();

function createFfmpegInputArgs(): Record<string, string> {
  const userAgent = process.env.FFMPEG_USER_AGENT || process.env.YTDLP_USER_AGENT || DEFAULT_FFMPEG_USER_AGENT;
  const referer = process.env.FFMPEG_REFERER || DEFAULT_FFMPEG_REFERER;
  const headers = [
    `Referer: ${referer}`,
    "Accept: */*",
    "Accept-Language: en-US,en;q=0.9"
  ];

  return {
    user_agent: userAgent,
    headers: `${headers.join("\r\n")}\r\n`
  };
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

function warnOnce(queue: Queue, key: string, message: string, details: Record<string, unknown>): void {
  const scopedKey = `${queue.id}:${key}`;
  if (playbackWarnings.has(scopedKey)) {
    return;
  }

  playbackWarnings.add(scopedKey);
  logger.warn({ guildId: queue.id, ...details }, "Music playback health check failed");
  void queue.textChannel?.send({ content: message });
}

function currentSongStillPlaying(queue: Queue, song: Song): boolean {
  const current = queue.songs[0];
  return Boolean(current && current.id === song.id && current.url === song.url);
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
  const ffmpegPath = process.env.FFMPEG_PATH || (typeof ffmpegStatic === "string" ? ffmpegStatic : "ffmpeg");
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
      new CookieAwareYtDlpPlugin(ytDlpCookieFile),
      createYouTubePlugin(youtubePluginCookies)
    ] as never
  });

  distube.on(Events.DEBUG, (message: string) => {
    logger.debug({ source: "distube" }, message);
  });

  distube.on(Events.FFMPEG_DEBUG, (message: string) => {
    logger.debug({ source: "ffmpeg" }, message);
  });

  distube.on(Events.INIT_QUEUE, (queue: Queue) => {
    attachVoiceDebugLogging(queue);
  });

  distube.on(Events.PLAY_SONG, (queue: Queue, song: Song) => {
    void queue.textChannel?.send({
      content: `Now playing: **${song.name}** - \`${song.formattedDuration}\``
    });
    schedulePlaybackHealthCheck(queue, song);
  });

  distube.on(Events.ADD_SONG, (queue: Queue, song: Song) => {
    void queue.textChannel?.send({ content: `Queued: **${song.name}**` });
  });

  distube.on(Events.ERROR, (error: Error, queue: Queue, song?: Song) => {
    const reason = formatDisTubeError(error);
    logger.error({ err: error, guildId: queue.id, song: song?.name }, "DisTube error");

    void queue.textChannel?.send({
      content: `Playback error${song?.name ? ` for **${song.name}**` : ""}: ${reason}`
    });
  });

  logger.info({ ffmpegPath }, "DisTube initialized");

  return distube;
}
