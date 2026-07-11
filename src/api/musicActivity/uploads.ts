import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import multer from "multer";
import { parseFile } from "music-metadata";
import type { Env } from "../../config/env.js";
import type { ActivityIdentity, ActivityMediaItem } from "./types.js";

const allowedExtensions = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac"]);
const allowedMimeTypes = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/flac",
  "audio/x-flac"
]);

export function isSupportedAudioFile(filename: string, mimeType: string): boolean {
  return allowedExtensions.has(path.extname(filename).toLowerCase()) && allowedMimeTypes.has(mimeType.toLowerCase());
}

export function safeUploadFilename(filename: string): string {
  return `${randomUUID()}${path.extname(filename).toLowerCase()}`;
}

type UploadRecord = {
  id: string;
  absolutePath: string;
  storedName: string;
  originalName: string;
  mimeType: string;
  uploaderUserId: string;
  roomId: string;
  media: ActivityMediaItem;
};

export class ActivityUploadStore {
  readonly middleware: multer.Multer;
  private readonly records = new Map<string, UploadRecord>();
  private readonly directory: string;

  constructor(private readonly env: Env) {
    this.directory = path.resolve(process.cwd(), env.UPLOAD_DIRECTORY);
    mkdirSync(this.directory, { recursive: true });
    this.middleware = multer({
      storage: multer.diskStorage({
        destination: this.directory,
        filename: (_req, file, callback) => {
          callback(null, safeUploadFilename(file.originalname));
        }
      }),
      limits: { files: 1, fileSize: Math.floor(env.UPLOAD_MAX_MB * 1024 * 1024) },
      fileFilter: (_req, file, callback) => {
        callback(null, isSupportedAudioFile(file.originalname, file.mimetype));
      }
    });
  }

  async register(file: Express.Multer.File, identity: ActivityIdentity): Promise<ActivityMediaItem> {
    try {
      const metadata = await parseFile(file.path, { duration: true });
      const durationSeconds = Math.round(metadata.format.duration ?? 0);
      if (durationSeconds <= 0) {
        throw new Error("Audio duration could not be read.");
      }
      const id = randomUUID();
      const baseName = path.basename(file.originalname, path.extname(file.originalname)).replace(/[\u0000-\u001f]/g, "").trim();
      const title = metadata.common.title?.trim() || baseName || "Uploaded audio";
      const creator = metadata.common.artist?.trim() || identity.username;
      const media: ActivityMediaItem = {
        id: `upload:${id}`,
        source: "upload",
        sourceId: id,
        playbackKind: "audio",
        title: title.slice(0, 200),
        creator: creator.slice(0, 120),
        collection: metadata.common.album?.trim().slice(0, 120),
        durationSeconds,
        url: `/api/uploads/${id}/content`,
        uploadedByUserId: identity.id
      };
      this.records.set(id, {
        id,
        absolutePath: file.path,
        storedName: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        uploaderUserId: identity.id,
        roomId: identity.roomId,
        media
      });
      return media;
    } catch (error) {
      this.removeFile(file.path);
      throw new Error(error instanceof Error ? `Invalid audio file: ${error.message}` : "Invalid audio file.");
    }
  }

  get(id: string): UploadRecord | undefined {
    return this.records.get(id);
  }

  delete(id: string, identity: ActivityIdentity, host: boolean): boolean {
    const record = this.records.get(id);
    if (!record || record.roomId !== identity.roomId) {
      return false;
    }
    if (record.uploaderUserId !== identity.id && !host) {
      throw new Error("Only the uploader or session host can delete this audio file.");
    }
    this.removeFile(record.absolutePath);
    this.records.delete(id);
    return true;
  }

  private removeFile(filePath: string): void {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }
}
