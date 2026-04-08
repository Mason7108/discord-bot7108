import { DisTube } from "distube";
import { SpotifyPlugin } from "@distube/spotify";
import { YtDlpPlugin } from "@distube/yt-dlp";
import type { Client } from "discord.js";

export async function createDisTube(client: Client): Promise<DisTube> {
  const distube = new DisTube(client as never, {
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
    console.error("DisTube error:", error);
  });

  return distube;
}
