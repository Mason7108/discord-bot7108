import type { Env } from "../../config/env.js";
import type { ActivityMediaItem, ActivitySearchPage } from "./types.js";

type SearchResponse = {
  nextPageToken?: string;
  items?: Array<{ id?: { videoId?: string } }>;
  error?: { message?: string };
};

type VideoResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      channelTitle?: string;
      thumbnails?: Record<string, { url?: string }>;
    };
    contentDetails?: { duration?: string };
    status?: { embeddable?: boolean; privacyStatus?: string };
  }>;
  error?: { message?: string };
};

export class YouTubeServiceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "YouTubeServiceError";
  }
}

export function parseIsoDuration(value: string): number {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value);
  if (!match) {
    return 0;
  }
  return Math.round(Number(match[1] ?? 0) * 86400 + Number(match[2] ?? 0) * 3600 + Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0));
}

function decodeTitle(value: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&quot;": '"',
    "&#39;": "'",
    "&lt;": "<",
    "&gt;": ">"
  };
  return value.replace(/&(amp|quot|#39|lt|gt);/g, (entity) => entities[entity] ?? entity);
}

function thumbnailUrl(thumbnails: Record<string, { url?: string }> | undefined): string | undefined {
  return thumbnails?.maxres?.url ?? thumbnails?.high?.url ?? thumbnails?.medium?.url ?? thumbnails?.default?.url;
}

export class YouTubeService {
  constructor(private readonly env: Env) {}

  get configured(): boolean {
    return Boolean(this.env.YOUTUBE_API_KEY);
  }

  async search(query: string, pageToken?: string, maxResults = 8): Promise<ActivitySearchPage> {
    const apiKey = this.requireKey();
    const params = new URLSearchParams({
      key: apiKey,
      part: "snippet",
      type: "video",
      q: query,
      maxResults: String(Math.min(Math.max(maxResults, 1), 12)),
      videoEmbeddable: "true",
      videoSyndicated: "true",
      safeSearch: "moderate"
    });
    if (pageToken) {
      params.set("pageToken", pageToken);
    }
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    const body = (await response.json()) as SearchResponse;
    if (!response.ok) {
      throw new YouTubeServiceError("YOUTUBE_SEARCH_FAILED", body.error?.message ?? "YouTube search failed.");
    }
    const videoIds = (body.items ?? []).map((item) => item.id?.videoId).filter((id): id is string => Boolean(id));
    const items = await this.getVideos(videoIds);
    return { items, nextPageToken: body.nextPageToken };
  }

  async getVideo(videoId: string): Promise<ActivityMediaItem> {
    const [item] = await this.getVideos([videoId]);
    if (!item) {
      throw new YouTubeServiceError("YOUTUBE_VIDEO_UNAVAILABLE", "That YouTube video is unavailable or cannot be embedded.");
    }
    return item;
  }

  async getVideos(videoIds: string[]): Promise<ActivityMediaItem[]> {
    if (videoIds.length === 0) {
      return [];
    }
    const params = new URLSearchParams({
      key: this.requireKey(),
      part: "snippet,contentDetails,status",
      id: videoIds.slice(0, 50).join(",")
    });
    const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
    const body = (await response.json()) as VideoResponse;
    if (!response.ok) {
      throw new YouTubeServiceError("YOUTUBE_DETAILS_FAILED", body.error?.message ?? "YouTube video details failed.");
    }
    const byId = new Map((body.items ?? []).map((item) => [item.id, item]));
    return videoIds.flatMap((videoId) => {
      const video = byId.get(videoId);
      if (!video?.id || !video.snippet?.title || video.status?.embeddable !== true || video.status.privacyStatus !== "public") {
        return [];
      }
      return [{
        id: `youtube:${video.id}`,
        source: "youtube" as const,
        sourceId: video.id,
        playbackKind: "youtube" as const,
        title: decodeTitle(video.snippet.title),
        creator: decodeTitle(video.snippet.channelTitle ?? "YouTube"),
        thumbnailUrl: thumbnailUrl(video.snippet.thumbnails),
        durationSeconds: parseIsoDuration(video.contentDetails?.duration ?? "PT0S"),
        url: `https://www.youtube.com/watch?v=${video.id}`,
        embeddable: true
      }];
    });
  }

  private requireKey(): string {
    if (!this.env.YOUTUBE_API_KEY) {
      throw new YouTubeServiceError("YOUTUBE_NOT_CONFIGURED", "YouTube search requires YOUTUBE_API_KEY on the server.");
    }
    return this.env.YOUTUBE_API_KEY;
  }
}

export function parseYouTubeVideoId(input: URL): string | undefined {
  const host = input.hostname.toLowerCase().replace(/^www\./, "");
  let candidate: string | null = null;
  if (host === "youtu.be") {
    candidate = input.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    candidate = input.searchParams.get("v");
    if (!candidate && input.pathname.startsWith("/shorts/")) {
      candidate = input.pathname.split("/")[2] ?? null;
    }
    if (!candidate && input.pathname.startsWith("/embed/")) {
      candidate = input.pathname.split("/")[2] ?? null;
    }
  }
  return candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : undefined;
}
