import { DisTubeError, PlayableExtractorPlugin, Playlist, Song, type DisTube, type ResolveOptions } from "distube";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, chmod, rename, unlink } from "node:fs/promises";
import https from "node:https";
import os from "node:os";
import path from "node:path";

type YtDlpInfo = Record<string, any>;
type YtDlpFormat = {
  url?: unknown;
  acodec?: unknown;
  vcodec?: unknown;
  abr?: unknown;
  tbr?: unknown;
};

const DEFAULT_YTDLP_TIMEOUT_MS = 15_000;
const DEFAULT_YTDLP_SEARCH_LIMIT = 5;
const DEFAULT_YTDLP_MAX_CANDIDATES = 3;
const DEFAULT_YTDLP_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

class NoPlayableAudioFormatsError extends Error {
  constructor(hasCookies: boolean) {
    super(
      hasCookies
        ? "YouTube returned no playable audio formats from Railway. Refresh YOUTUBE_COOKIES_BASE64; if it still fails, set YTDLP_PROXY/YOUTUBE_PROXY."
        : "YouTube returned no playable audio formats from Railway. Set YOUTUBE_COOKIES_BASE64; if it still fails, set YTDLP_PROXY/YOUTUBE_PROXY."
    );
  }
}

function isPlaylist(info: YtDlpInfo): boolean {
  return Array.isArray(info.entries);
}

function formatYtDlpError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.replace(/\s+/g, " ").trim();
  }

  return String(error);
}

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function ytDlpTimeoutMs(): number {
  return envNumber("YTDLP_TIMEOUT_MS", DEFAULT_YTDLP_TIMEOUT_MS, 5_000, 45_000);
}

function ytDlpSearchLimit(): number {
  return envNumber("YTDLP_SEARCH_LIMIT", DEFAULT_YTDLP_SEARCH_LIMIT, 1, 10);
}

function ytDlpMaxCandidates(): number {
  return envNumber("YTDLP_MAX_CANDIDATES", DEFAULT_YTDLP_MAX_CANDIDATES, 1, 10);
}

function getYtDlpProxy(): string | undefined {
  return process.env.YTDLP_PROXY || process.env.YOUTUBE_PROXY || undefined;
}

function getYtDlpUserAgent(): string {
  return process.env.YTDLP_USER_AGENT || process.env.FFMPEG_USER_AGENT || DEFAULT_YTDLP_USER_AGENT;
}

function getExtractorArgs(): Array<string | undefined> {
  const configured = process.env.YTDLP_EXTRACTOR_ARGS?.trim();
  const values = [
    configured || undefined,
    undefined,
    "youtube:player_client=android,ios,web",
    "youtube:player_client=android",
    "youtube:player_client=web"
  ];

  return values.filter((value, index, array) => array.indexOf(value) === index);
}

function ytDlpBaseFlags(cookieFilePath: string | undefined, extra: Record<string, unknown> = {}) {
  const proxy = getYtDlpProxy();

  return {
    ignoreConfig: true,
    dumpSingleJson: true,
    noWarnings: true,
    userAgent: getYtDlpUserAgent(),
    remoteComponents: "ejs:github",
    jsRuntimes: "node",
    skipDownload: true,
    simulate: true,
    ...(cookieFilePath ? { cookies: cookieFilePath } : {}),
    ...(proxy ? { proxy } : {}),
    ...extra
  };
}

function ytDlpStreamFlags(cookieFilePath: string | undefined, extra: Record<string, unknown> = {}) {
  return ytDlpBaseFlags(cookieFilePath, {
    format: "bestaudio/best",
    ...extra
  });
}

function ytDlpSearchFlags(cookieFilePath: string | undefined, extra: Record<string, unknown> = {}) {
  return ytDlpBaseFlags(cookieFilePath, {
    flatPlaylist: true,
    ignoreErrors: true,
    playlistEnd: ytDlpSearchLimit(),
    ...extra
  });
}

function ytDlpStreamFlagSets(cookieFilePath: string | undefined): Record<string, unknown>[] {
  const extractorArgs = getExtractorArgs();
  const withFormat = extractorArgs.map((value) =>
    ytDlpStreamFlags(cookieFilePath, {
      ...(value ? { extractorArgs: value } : {})
    })
  );
  const metadataFallback = extractorArgs.slice(0, 2).flatMap((value) => [
    ytDlpStreamFlags(cookieFilePath, {
      ignoreNoFormatsError: true,
      ...(value ? { extractorArgs: value } : {})
    }),
    ytDlpBaseFlags(cookieFilePath, {
      ignoreNoFormatsError: true,
      ...(value ? { extractorArgs: value } : {})
    })
  ]);

  return [...withFormat, ...metadataFallback];
}

function toKebabCase(input: string): string {
  return input.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function toYtDlpArgs(url: string, flags: Record<string, unknown>): string[] {
  const args: string[] = [];

  for (const [key, value] of Object.entries(flags)) {
    if (value === undefined || value === null || value === false) {
      continue;
    }

    const flag = `--${toKebabCase(key)}`;
    if (value === true) {
      args.push(flag);
      continue;
    }

    args.push(flag, String(value));
  }

  return [...args, url];
}

function hasStreamUrl(format: YtDlpFormat | undefined): format is YtDlpFormat & { url: string } {
  return typeof format?.url === "string" && format.url.length > 0;
}

function hasAudio(format: YtDlpFormat): boolean {
  const audioCodec = typeof format.acodec === "string" ? format.acodec : undefined;
  return audioCodec === undefined || audioCodec.length === 0 || audioCodec !== "none";
}

function isAudioOnly(format: YtDlpFormat): boolean {
  const videoCodec = typeof format.vcodec === "string" ? format.vcodec : undefined;
  return hasAudio(format) && videoCodec === "none";
}

function numericValue(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function formatScore(format: YtDlpFormat): number {
  const audioScore = isAudioOnly(format) ? 10_000 : hasAudio(format) ? 5_000 : 0;
  return audioScore + Math.max(numericValue(format.abr), numericValue(format.tbr));
}

function bestAudioStreamUrl(formats: unknown): string | undefined {
  if (!Array.isArray(formats)) {
    return undefined;
  }

  const playableFormats = formats
    .filter((format): format is YtDlpFormat & { url: string } => {
      return typeof format === "object" && format !== null && hasStreamUrl(format) && hasAudio(format);
    })
    .sort((left, right) => formatScore(right) - formatScore(left));

  return playableFormats[0]?.url;
}

function getPlayableStreamUrl(info: YtDlpInfo): string | undefined {
  return (
    bestAudioStreamUrl(info.requested_downloads) ??
    bestAudioStreamUrl(info.requested_formats) ??
    (hasStreamUrl(info) && hasAudio(info) ? info.url : undefined) ??
    bestAudioStreamUrl(info.formats)
  );
}

function toYtSearchQuery(query: string, limit: number): string {
  return `ytsearch${limit}:${query}`;
}

function isYouTubeId(input: string): boolean {
  return /^[\w-]{11}$/.test(input);
}

function getSearchCandidateUrl(entry: YtDlpInfo): string | undefined {
  const webpageUrl = typeof entry.webpage_url === "string" ? entry.webpage_url : undefined;
  if (webpageUrl?.startsWith("http://") || webpageUrl?.startsWith("https://")) {
    return webpageUrl;
  }

  const url = typeof entry.url === "string" ? entry.url : undefined;
  if (url?.startsWith("http://") || url?.startsWith("https://")) {
    return url;
  }

  const id = typeof entry.id === "string" ? entry.id : url;
  if (typeof id === "string" && isYouTubeId(id)) {
    return `https://www.youtube.com/watch?v=${id}`;
  }

  return undefined;
}

function getYtDlpAssetName(): string {
  if (process.platform === "win32") {
    return "yt-dlp.exe";
  }

  if (process.platform === "linux" && process.arch === "arm64") {
    return "yt-dlp_linux_aarch64";
  }

  if (process.platform === "linux") {
    return "yt-dlp_linux";
  }

  return "yt-dlp";
}

function getYtDlpBinaryPath(): string {
  return path.join(os.tmpdir(), process.platform === "win32" ? "bot7108-yt-dlp.exe" : "bot7108-yt-dlp");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function downloadFile(url: string, targetPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      const statusCode = response.statusCode ?? 0;

      if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
        response.resume();
        downloadFile(response.headers.location, targetPath).then(resolve, reject);
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`Failed to download yt-dlp standalone binary: HTTP ${statusCode}`));
        return;
      }

      const output = createWriteStream(targetPath, { mode: 0o755 });
      response.pipe(output);
      output.on("finish", () => {
        output.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
      output.on("error", reject);
    });

    request.on("error", reject);
  });
}

async function ensureStandaloneYtDlp(): Promise<string> {
  const binaryPath = getYtDlpBinaryPath();
  if (await fileExists(binaryPath)) {
    return binaryPath;
  }

  const assetName = getYtDlpAssetName();
  const downloadUrl = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${assetName}`;
  const partialPath = `${binaryPath}.download`;

  await unlink(partialPath).catch(() => undefined);
  await downloadFile(downloadUrl, partialPath);
  if (process.platform !== "win32") {
    await chmod(partialPath, 0o755);
  }
  await rename(partialPath, binaryPath);

  return binaryPath;
}

async function ytDlpJson(url: string, flags: Record<string, unknown>): Promise<YtDlpInfo> {
  const binaryPath = await ensureStandaloneYtDlp();
  const args = toYtDlpArgs(url, flags);
  const timeoutMs = ytDlpTimeoutMs();

  return new Promise((resolve, reject) => {
    const process = spawn(binaryPath, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      callback();
    };

    const timeout = setTimeout(() => {
      process.kill();
      finish(() => reject(new Error(`yt-dlp timed out after ${timeoutMs}ms`)));
    }, timeoutMs);

    process.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });

    process.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });

    process.on("error", (error) => {
      finish(() => reject(error));
    });
    process.on("close", (code) => {
      if (code !== 0) {
        finish(() => reject(new Error((stderr || stdout || `yt-dlp exited with code ${code}`).trim())));
        return;
      }

      try {
        const parsed = JSON.parse(stdout) as YtDlpInfo;
        finish(() => resolve(parsed));
      } catch (error) {
        finish(() => reject(error));
      }
    });
  });
}

async function ytDlpPlayableInfo(url: string, cookieFilePath: string | undefined): Promise<YtDlpInfo> {
  const errors: string[] = [];

  for (const flags of ytDlpStreamFlagSets(cookieFilePath)) {
    try {
      const info = await ytDlpJson(url, flags);
      if (isPlaylist(info) || getPlayableStreamUrl(info)) {
        return info;
      }

      errors.push("yt-dlp returned metadata without playable audio formats.");
    } catch (error) {
      errors.push(formatYtDlpError(error));
    }
  }

  if (errors.some((error) => error.includes("metadata without playable audio formats") || error.includes("Requested format is not available"))) {
    throw new NoPlayableAudioFormatsError(Boolean(cookieFilePath));
  }

  throw new Error(errors.slice(0, 2).join(" | ") || "yt-dlp did not return playable metadata.");
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

    const streamUrl = getPlayableStreamUrl(info);
    if (streamUrl && this.stream.playFromSource) {
      this.stream.url = streamUrl;
    }
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
    const info = await ytDlpPlayableInfo(url, this.cookieFilePath).catch((error: unknown) => {
      throw new DisTubeError("YTDLP_ERROR", formatYtDlpError(error));
    });

    if (isPlaylist(info)) {
      if (!Array.isArray(info.entries) || info.entries.length === 0) {
        throw new DisTubeError("YTDLP_ERROR", "The playlist is empty.");
      }

      return new Playlist(
        {
          source: String(info.extractor ?? "yt-dlp"),
          songs: info.entries
            .filter((entry: unknown): entry is YtDlpInfo => typeof entry === "object" && entry !== null)
            .map((entry: YtDlpInfo) => new CookieAwareYtDlpSong(this, entry, options)),
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

  async resolveSearch<T>(query: string, options: ResolveOptions<T>): Promise<Song<T>> {
    const searchLimit = Math.max(ytDlpSearchLimit(), ytDlpMaxCandidates());
    const info = await ytDlpJson(
      toYtSearchQuery(query, searchLimit),
      ytDlpSearchFlags(this.cookieFilePath)
    ).catch((error: unknown) => {
      throw new DisTubeError("YTDLP_ERROR", formatYtDlpError(error));
    });

    if (!isPlaylist(info)) {
      return new CookieAwareYtDlpSong(this, info, options);
    }

    const entries = Array.isArray(info.entries)
      ? info.entries.filter((entry: unknown): entry is YtDlpInfo => typeof entry === "object" && entry !== null)
      : [];
    const errors: string[] = [];

    for (const entry of entries.slice(0, ytDlpMaxCandidates())) {
      const candidateUrl = getSearchCandidateUrl(entry);
      if (!candidateUrl) {
        continue;
      }

      try {
        const resolved = await this.resolve(candidateUrl, options);
        if (resolved instanceof Song) {
          return resolved;
        }
      } catch (error) {
        errors.push(formatYtDlpError(error));
      }
    }

    const noAudioFormatErrors = errors.filter((error) => error.includes("YouTube returned no playable audio formats"));
    if (noAudioFormatErrors.length > 0 && noAudioFormatErrors.length === errors.length) {
      throw new DisTubeError("YTDLP_ERROR", noAudioFormatErrors[0]);
    }

    const reason = errors.length > 0 ? ` ${errors.slice(0, 2).join(" | ")}` : "";
    throw new DisTubeError("YTDLP_ERROR", `No playable YouTube search results were found.${reason}`);
  }

  async getStreamURL(song: Song): Promise<string> {
    if (!song.url) {
      throw new DisTubeError("YTDLP_PLUGIN_INVALID_SONG", "Cannot get stream URL from an invalid song.");
    }

    const info = await ytDlpPlayableInfo(song.url, this.cookieFilePath).catch((error: unknown) => {
      throw new DisTubeError("YTDLP_ERROR", formatYtDlpError(error));
    });

    if (isPlaylist(info)) {
      throw new DisTubeError("YTDLP_ERROR", "Cannot get stream URL for an entire playlist.");
    }

    const streamUrl = getPlayableStreamUrl(info);
    if (!streamUrl) {
      throw new DisTubeError("YTDLP_ERROR", "yt-dlp did not return a playable stream URL.");
    }

    return streamUrl;
  }

  getRelatedSongs(): never[] {
    return [];
  }
}
