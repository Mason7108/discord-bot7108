import { DisTubeError, PlayableExtractorPlugin, Playlist, Song, type DisTube, type ResolveOptions } from "distube";
import { json } from "@distube/yt-dlp";

type YtDlpInfo = Record<string, any>;

function isPlaylist(info: YtDlpInfo): boolean {
  return Array.isArray(info.entries);
}

function formatYtDlpError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.replace(/\s+/g, " ").trim();
  }

  return String(error);
}

function ytDlpFlags(cookieFilePath: string | undefined, extra: Record<string, unknown> = {}) {
  return {
    dumpSingleJson: true,
    noWarnings: true,
    noCallHome: true,
    preferFreeFormats: true,
    skipDownload: true,
    simulate: true,
    ...(cookieFilePath ? { cookies: cookieFilePath } : {}),
    ...extra
  };
}

class CookieAwareYtDlpSong<T = unknown> extends Song<T> {
  constructor(plugin: CookieAwareYtDlpPlugin, info: YtDlpInfo, options: ResolveOptions<T> = {}) {
    super(
      {
        plugin,
        source: String(info.extractor ?? "yt-dlp"),
        playFromSource: true,
        id: String(info.id ?? info.display_id ?? info.webpage_url ?? info.original_url),
        name: info.title || info.fulltitle,
        url: info.webpage_url || info.original_url || info.url,
        isLive: Boolean(info.is_live),
        thumbnail: info.thumbnail || info.thumbnails?.[0]?.url,
        duration: info.is_live ? 0 : Number(info.duration ?? 0),
        uploader: {
          name: info.uploader,
          url: info.uploader_url
        },
        views: info.view_count,
        likes: info.like_count,
        dislikes: info.dislike_count,
        reposts: info.repost_count,
        ageRestricted: Boolean(info.age_limit) && Number(info.age_limit) >= 18
      },
      options
    );
  }
}

export class CookieAwareYtDlpPlugin extends PlayableExtractorPlugin {
  constructor(private readonly cookieFilePath?: string) {
    super();
  }

  init(distube: DisTube): void {
    super.init(distube);
  }

  validate(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  async resolve<T>(url: string, options: ResolveOptions<T>): Promise<Song<T> | Playlist<T>> {
    const info = (await json(url, ytDlpFlags(this.cookieFilePath)).catch((error: unknown) => {
      throw new DisTubeError("YTDLP_ERROR", formatYtDlpError(error));
    })) as unknown as YtDlpInfo;

    if (isPlaylist(info)) {
      if (!Array.isArray(info.entries) || info.entries.length === 0) {
        throw new DisTubeError("YTDLP_ERROR", "The playlist is empty.");
      }

      return new Playlist(
        {
          source: String(info.extractor ?? "yt-dlp"),
          songs: info.entries.map((entry: YtDlpInfo) => new CookieAwareYtDlpSong(this, entry, options)),
          id: String(info.id ?? info.webpage_url ?? url),
          name: info.title,
          url: info.webpage_url || url,
          thumbnail: info.thumbnails?.[0]?.url
        },
        options
      );
    }

    return new CookieAwareYtDlpSong(this, info, options);
  }

  async getStreamURL(song: Song): Promise<string> {
    if (!song.url) {
      throw new DisTubeError("YTDLP_PLUGIN_INVALID_SONG", "Cannot get stream URL from an invalid song.");
    }

    const info = (await json(song.url, ytDlpFlags(this.cookieFilePath, { format: "ba/ba*" })).catch((error: unknown) => {
      throw new DisTubeError("YTDLP_ERROR", formatYtDlpError(error));
    })) as unknown as YtDlpInfo;

    if (isPlaylist(info)) {
      throw new DisTubeError("YTDLP_ERROR", "Cannot get stream URL for an entire playlist.");
    }

    if (typeof info.url !== "string" || info.url.length === 0) {
      throw new DisTubeError("YTDLP_ERROR", "yt-dlp did not return a playable stream URL.");
    }

    return info.url;
  }

  getRelatedSongs(): never[] {
    return [];
  }
}
