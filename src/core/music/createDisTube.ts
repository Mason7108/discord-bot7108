import { DisTube } from "distube";
import { SpotifyPlugin } from "@distube/spotify";
import { YtDlpPlugin } from "@distube/yt-dlp";
import ffmpegStatic from "ffmpeg-static";
import type { Client } from "discord.js";
import { logger } from "../../utils/logger.js";

export async function createDisTube(client: Client): Promise<DisTube> {
  const ffmpegPath = process.env.FFMPEG_PATH || (typeof ffmpegStatic === "string" ? ffmpegStatic : "ffmpeg");

  const distube = new DisTube(client as never, {
    ffmpeg: { path: ffmpegPath },
    emitNewSongOnly: true,
    plugins: [new SpotifyPlugin() as never, new YtDlpPlugin() as never] as never
  });

  const bus = distube as any;

  bus.on("playSong", (queue: any, song: any) => {
    void queue.textChannel?.send({
      content: `Now playing: **${song.name}** - \`${song.formattedDuration}\``
    });
  });

  bus.on("addSong", (queue: any, song: any) => {
    void queue.textChannel?.send({ content: `Queued: **${song.name}**` });
  });

  bus.on("error", (_channel: unknown, error: unknown) => {
    logger.error({ err: error }, "DisTube error");
  });

  logger.info({ ffmpegPath }, "DisTube initialized");

  return distube;
}
