import type { ActivityMediaItem } from "./types.js";
import { SpotifyService, parseSpotifyUrl } from "./spotify.js";
import { YouTubeService, parseYouTubeVideoId } from "./youtube.js";

export class MediaResolver {
  constructor(private readonly youtube: YouTubeService, private readonly spotify: SpotifyService) {}

  async resolve(rawUrl: string): Promise<ActivityMediaItem> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new Error("Enter a valid YouTube or Spotify URL.");
    }
    if (url.protocol !== "https:") {
      throw new Error("Media links must use HTTPS.");
    }
    const youtubeId = parseYouTubeVideoId(url);
    if (youtubeId) {
      return this.youtube.getVideo(youtubeId);
    }
    if (parseSpotifyUrl(url)) {
      return this.spotify.resolve(url);
    }
    throw new Error("Only YouTube video and Spotify track, album, or playlist links are supported.");
  }
}
