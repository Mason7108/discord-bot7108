import type { ActivityMediaResolution } from "./types.js";
import { SpotifyService, parseSpotifyUrl } from "./spotify.js";
import { YouTubeService, parseYouTubePlaylistId, parseYouTubeVideoId } from "./youtube.js";

export class MediaResolver {
  constructor(private readonly youtube: YouTubeService, private readonly spotify: SpotifyService) {}

  async resolve(rawUrl: string): Promise<ActivityMediaResolution> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new Error("Enter a valid YouTube or Spotify URL.");
    }
    if (url.protocol !== "https:") {
      throw new Error("Media links must use HTTPS.");
    }
    const playlistId = parseYouTubePlaylistId(url);
    if (playlistId) {
      return { kind: "playlist", items: await this.youtube.getPlaylist(playlistId) };
    }
    const youtubeId = parseYouTubeVideoId(url);
    if (youtubeId) {
      return { kind: "single", items: [await this.youtube.getVideo(youtubeId)] };
    }
    if (parseSpotifyUrl(url)) {
      return { kind: "single", items: [await this.spotify.resolve(url)] };
    }
    throw new Error("Only YouTube video and Spotify track, album, or playlist links are supported.");
  }
}
