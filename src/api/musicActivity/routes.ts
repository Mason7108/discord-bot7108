import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import rateLimit from "express-rate-limit";
import { z, ZodError } from "zod";
import type { Env } from "../../config/env.js";
import type { ActivityAuthenticator } from "./auth.js";
import { ActivityAuthError } from "./auth.js";
import { MediaResolver } from "./mediaResolver.js";
import type { MusicActivityService } from "./service.js";
import { SpotifyService } from "./spotify.js";
import { ActivityUploadStore } from "./uploads.js";
import { YouTubeService } from "./youtube.js";

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  pageToken: z.string().max(256).regex(/^[A-Za-z0-9_-]+$/).optional(),
  limit: z.coerce.number().int().min(1).max(12).default(8)
});
const resolveSchema = z.object({ url: z.string().trim().url().max(2048) });
const idSchema = z.string().uuid();

function sendError(res: Response, error: unknown): void {
  if (error instanceof ActivityAuthError) {
    res.status(error.status).json({ ok: false, error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({ ok: false, error: { code: "INVALID_INPUT", message: error.issues[0]?.message ?? "Invalid input." } });
    return;
  }
  const message = error instanceof Error ? error.message : "Activity request failed.";
  res.status(400).json({ ok: false, error: { code: "REQUEST_FAILED", message } });
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}

export function registerMusicActivityRoutes(
  app: Express,
  env: Env,
  auth: ActivityAuthenticator,
  service: MusicActivityService
): void {
  const youtube = new YouTubeService(env);
  const spotify = new SpotifyService(env);
  const resolver = new MediaResolver(youtube, spotify);
  const uploads = new ActivityUploadStore(env);
  const searchLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });
  const mutationLimiter = rateLimit({ windowMs: 60_000, limit: 80, standardHeaders: true, legacyHeaders: false });

  app.get(["/api/health", "/api/activity/health"], (_req, res) => {
    res.json({
      ok: true,
      app: "bot7108 Activity",
      youtubeConfigured: youtube.configured,
      spotifyConfigured: spotify.configured,
      uploads: { maxMb: env.UPLOAD_MAX_MB }
    });
  });

  app.post("/api/auth/discord", mutationLimiter, asyncRoute(async (req, res) => {
    try {
      res.json({ ok: true, data: await auth.authenticateDiscord(req.body) });
    } catch (error) {
      sendError(res, error);
    }
  }));

  app.post("/api/auth/dev", mutationLimiter, (req, res) => {
    try {
      res.json({ ok: true, data: auth.authenticateDevelopment(req.body) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/dev/youtube-fixture", auth.requestMiddleware, (req, res) => {
    if (env.NODE_ENV === "production") {
      res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Not found." } });
      return;
    }
    const item = {
      id: "youtube:M7lc1UVf-VE",
      source: "youtube" as const,
      sourceId: "M7lc1UVf-VE",
      playbackKind: "youtube" as const,
      title: "YouTube IFrame API player sample",
      creator: "Google for Developers",
      thumbnailUrl: "https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg",
      durationSeconds: 315,
      url: "https://www.youtube.com/watch?v=M7lc1UVf-VE",
      embeddable: true
    };
    res.json({ ok: true, data: auth.signMedia(item, req.activityIdentity!) });
  });

  app.get("/api/youtube/search", auth.requestMiddleware, searchLimiter, asyncRoute(async (req, res) => {
    try {
      const query = searchQuerySchema.parse(req.query);
      const page = await youtube.search(query.q, query.pageToken, query.limit);
      res.json({
        ok: true,
        data: { ...page, items: page.items.map((item) => auth.signMedia(item, req.activityIdentity!)) }
      });
    } catch (error) {
      sendError(res, error);
    }
  }));

  app.post("/api/media/resolve", auth.requestMiddleware, mutationLimiter, asyncRoute(async (req, res) => {
    try {
      const body = resolveSchema.parse(req.body);
      res.json({ ok: true, data: auth.signMedia(await resolver.resolve(body.url), req.activityIdentity!) });
    } catch (error) {
      sendError(res, error);
    }
  }));

  app.get("/api/session/current", auth.requestMiddleware, (req, res) => {
    res.json({ ok: true, data: service.getState(req.activityIdentity!) });
  });

  app.post("/api/uploads", auth.requestMiddleware, mutationLimiter, (req, res) => {
    uploads.middleware.single("file")(req, res, async (uploadError) => {
      try {
        if (uploadError) {
          throw uploadError;
        }
        if (!req.file) {
          throw new Error("Choose a supported MP3, WAV, M4A, AAC, or FLAC audio file.");
        }
        const media = await uploads.register(req.file, req.activityIdentity!);
        res.json({ ok: true, data: auth.signMedia(media, req.activityIdentity!) });
      } catch (error) {
        sendError(res, error);
      }
    });
  });

  app.get("/api/uploads/:id/content", (req, res) => {
    try {
      const id = idSchema.parse(req.params.id);
      const record = uploads.get(id);
      if (!record || !existsSync(record.absolutePath)) {
        res.status(404).json({ ok: false, error: { code: "UPLOAD_NOT_FOUND", message: "Uploaded audio was not found." } });
        return;
      }
      res.setHeader("Content-Type", record.mimeType);
      res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(record.originalName)}`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.sendFile(record.absolutePath);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete("/api/uploads/:id", auth.requestMiddleware, mutationLimiter, (req, res) => {
    try {
      const id = idSchema.parse(req.params.id);
      const identity = req.activityIdentity!;
      const deleted = uploads.delete(id, identity, service.isHost(identity));
      if (!deleted) {
        res.status(404).json({ ok: false, error: { code: "UPLOAD_NOT_FOUND", message: "Uploaded audio was not found." } });
        return;
      }
      res.json({ ok: true, data: { deleted: true } });
    } catch (error) {
      sendError(res, error);
    }
  });

  const activityDistDir = path.resolve(process.cwd(), "activity", "dist");
  if (existsSync(activityDistDir)) {
    app.use(express.static(activityDistDir, { index: false, maxAge: env.NODE_ENV === "production" ? "1h" : 0 }));
    app.get(["/", "/activity", "/activity/*"], (_req, res) => res.sendFile(path.join(activityDistDir, "index.html")));
  }

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    sendError(res, error);
  });
}
