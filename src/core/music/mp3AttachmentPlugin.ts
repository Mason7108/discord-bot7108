import { DisTubeError, PlayableExtractorPlugin, Song, type ResolveOptions } from "distube";

const DISCORD_ATTACHMENT_HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net"]);

type Mp3AttachmentMetadata = {
  attachmentName?: unknown;
  attachmentDuration?: unknown;
};

function getAttachmentMetadata(metadata: unknown): Mp3AttachmentMetadata {
  return metadata && typeof metadata === "object" ? (metadata as Mp3AttachmentMetadata) : {};
}

function metadataString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function metadataDuration(value: unknown): number | undefined {
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 ? duration : undefined;
}

function isDiscordAttachmentHost(hostname: string): boolean {
  return DISCORD_ATTACHMENT_HOSTS.has(hostname.toLowerCase());
}

function isDiscordAttachmentPath(pathname: string): boolean {
  return pathname.includes("/attachments/") || pathname.includes("/ephemeral-attachments/");
}

function isMp3Path(pathname: string): boolean {
  return pathname.toLowerCase().endsWith(".mp3");
}

function getAttachmentName(url: string): string {
  try {
    const parsed = new URL(url);
    const rawName = parsed.pathname.split("/").filter(Boolean).at(-1);
    return rawName ? decodeURIComponent(rawName) : "uploaded.mp3";
  } catch {
    return "uploaded.mp3";
  }
}

export class Mp3AttachmentPlugin extends PlayableExtractorPlugin {
  validate(url: string): boolean {
    try {
      const parsed = new URL(url);
      return (
        (parsed.protocol === "http:" || parsed.protocol === "https:") &&
        isDiscordAttachmentHost(parsed.hostname) &&
        isDiscordAttachmentPath(parsed.pathname) &&
        isMp3Path(parsed.pathname)
      );
    } catch {
      return false;
    }
  }

  resolve<T>(url: string, options: ResolveOptions<T>): Song<T> {
    if (!this.validate(url)) {
      throw new DisTubeError("MP3_ATTACHMENT_ERROR", "Only Discord-hosted .mp3 attachments can be played as uploads.");
    }

    const metadata = getAttachmentMetadata(options.metadata);

    return new Song(
      {
        plugin: this,
        source: "discord-mp3",
        playFromSource: true,
        id: url,
        name: metadataString(metadata.attachmentName) ?? getAttachmentName(url),
        url,
        duration: metadataDuration(metadata.attachmentDuration) ?? 0
      },
      options
    );
  }

  getStreamURL(song: Song): string {
    if (!song.url || !this.validate(song.url)) {
      throw new DisTubeError("MP3_ATTACHMENT_ERROR", "Cannot stream an invalid MP3 attachment.");
    }

    return song.url;
  }

  getRelatedSongs(): never[] {
    return [];
  }
}
