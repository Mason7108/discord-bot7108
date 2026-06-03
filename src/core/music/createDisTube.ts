import { DisTube, Events, type Queue, type Song } from "distube";
import { SpotifyPlugin } from "@distube/spotify";
import { YouTubePlugin } from "@distube/youtube";
import { YtDlpPlugin } from "@distube/yt-dlp";
import ffmpegStatic from "ffmpeg-static";
import type { Client } from "discord.js";
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

function formatDisTubeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    const compactMessage = error.message.replace(/\s+/g, " ").trim();
    if (compactMessage.includes("Sign in to confirm you're not a bot")) {
      return "YouTube is blocking anonymous playback. Set YOUTUBE_COOKIES_BASE64 in the bot host with exported YouTube cookies.";
    }

    return compactMessage.length > 240 ? `${compactMessage.slice(0, 240)}...` : compactMessage;
  }

  return "Unknown playback error.";
}

export async function createDisTube(client: Client): Promise<DisTube> {
  const ffmpegPath = process.env.FFMPEG_PATH || (typeof ffmpegStatic === "string" ? ffmpegStatic : "ffmpeg");
  const youtubeCookies = parseYouTubeCookies();

  const distube = new DisTube(client as never, {
    ffmpeg: { path: ffmpegPath },
    emitNewSongOnly: true,
    plugins: [new SpotifyPlugin(), new YouTubePlugin({ cookies: youtubeCookies }), new YtDlpPlugin()] as never
  });

  distube.on(Events.PLAY_SONG, (queue: Queue, song: Song) => {
    void queue.textChannel?.send({
      content: `Now playing: **${song.name}** - \`${song.formattedDuration}\``
    });
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
