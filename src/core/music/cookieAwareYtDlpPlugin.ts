import { DisTubeError, PlayableExtractorPlugin, Playlist, Song, type DisTube, type ResolveOptions } from "distube";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, chmod, rename, unlink } from "node:fs/promises";
import https from "node:https";
import os from "node:os";
import path from "node:path";

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
    preferFreeFormats: true,
    skipDownload: true,
    simulate: true,
    ...(cookieFilePath ? { cookies: cookieFilePath } : {}),
    ...extra
  };
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

  return new Promise((resolve, reject) => {
    const process = spawn(binaryPath, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";

    process.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });

    process.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });

    process.on("error", reject);
    process.on("close", (code) => {
      if (code !== 0) {
        reject(new Error((stderr || stdout || `yt-dlp exited with code ${code}`).trim()));
        return;
      }

      try {
        resolve(JSON.parse(stdout) as YtDlpInfo);
      } catch (error) {
        reject(error);
      }
    });
  });
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
    const info = await ytDlpJson(url, ytDlpFlags(this.cookieFilePath)).catch((error: unknown) => {
      throw new DisTubeError("YTDLP_ERROR", formatYtDlpError(error));
    });

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

    const info = await ytDlpJson(song.url, ytDlpFlags(this.cookieFilePath, { format: "ba/ba*" })).catch((error: unknown) => {
      throw new DisTubeError("YTDLP_ERROR", formatYtDlpError(error));
    });

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
