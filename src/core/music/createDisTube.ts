import { DisTube, Events, type Queue, type Song } from "distube";
import { SpotifyPlugin } from "@distube/spotify";
import { YouTubePlugin } from "@distube/youtube";
import { YtDlpPlugin } from "@distube/yt-dlp";
import ffmpegStatic from "ffmpeg-static";
import type { Client } from "discord.js";
import { logger } from "../../utils/logger.js";

function formatDisTubeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    const compactMessage = error.message.replace(/\s+/g, " ").trim();
    return compactMessage.length > 240 ? `${compactMessage.slice(0, 240)}...` : compactMessage;
  }

  return "Unknown playback error.";
}

export async function createDisTube(client: Client): Promise<DisTube> {
  const ffmpegPath = process.env.FFMPEG_PATH || (typeof ffmpegStatic === "string" ? ffmpegStatic : "ffmpeg");

  const distube = new DisTube(client as never, {
    ffmpeg: { path: ffmpegPath },
    emitNewSongOnly: true,
    plugins: [new SpotifyPlugin(), new YouTubePlugin(), new YtDlpPlugin()] as never
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
