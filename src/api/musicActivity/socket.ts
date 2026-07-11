import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer, type Socket } from "socket.io";
import { z, ZodError } from "zod";
import type { Env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import type { ActivityAuthenticator } from "./auth.js";
import { ActivityAuthError } from "./auth.js";
import { ActivityCommandError, type MusicActivityService } from "./service.js";
import type {
  ActivityAck,
  ActivityClientToServerEvents,
  ActivityError,
  ActivityIdentity,
  ActivityMediaItem,
  ActivityServerToClientEvents,
  ActivitySessionState
} from "./types.js";

type SocketData = { identity: ActivityIdentity };
type ActivitySocket = Socket<ActivityClientToServerEvents, ActivityServerToClientEvents, Record<string, never>, SocketData>;

const mediaItemSchema = z.object({
  id: z.string().min(1).max(256),
  source: z.enum(["youtube", "spotify", "upload"]),
  sourceId: z.string().min(1).max(256),
  playbackKind: z.enum(["youtube", "audio", "none"]),
  title: z.string().trim().min(1).max(200),
  creator: z.string().trim().min(1).max(120),
  collection: z.string().max(120).optional(),
  thumbnailUrl: z.string().url().max(2048).optional(),
  durationSeconds: z.number().finite().min(0).max(86400),
  url: z.string().max(2048),
  embeddable: z.boolean().optional(),
  metadataOnly: z.boolean().optional(),
  uploadedByUserId: z.string().max(128).optional(),
  proof: z.string().min(32).max(128)
});
const queueItemIdSchema = z.object({ queueItemId: z.string().uuid() });
const queueOrderSchema = z.object({ queueItemIds: z.array(z.string().uuid()).max(200) });
const positionSchema = z.object({ positionSeconds: z.number().finite().min(0).max(86400) });
const endedSchema = z.object({ queueItemId: z.string().uuid() });
const booleanSchema = z.object({ enabled: z.boolean() });
const repeatSchema = z.object({ mode: z.enum(["off", "one", "all"]) });
const transferSchema = z.object({ userId: z.string().min(1).max(128) });

function toError(error: unknown): ActivityError {
  if (error instanceof ActivityCommandError || error instanceof ActivityAuthError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof ZodError) {
    return { code: "INVALID_INPUT", message: error.issues[0]?.message ?? "Invalid input." };
  }
  return { code: "COMMAND_FAILED", message: error instanceof Error ? error.message : "Activity command failed." };
}

function run<T>(ack: ((response: ActivityAck<T>) => void) | undefined, action: () => T): void {
  try {
    ack?.({ ok: true, data: action() });
  } catch (error) {
    const activityError = toError(error);
    logger.warn({ code: activityError.code }, "Activity socket command rejected");
    ack?.({ ok: false, error: activityError });
  }
}

function allowedOrigins(env: Env): string[] {
  const configured = env.ACTIVITY_ALLOWED_ORIGINS?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  return [...new Set([env.FRONTEND_ORIGIN, env.PUBLIC_ACTIVITY_URL, ...configured, ...(env.NODE_ENV !== "production" ? ["http://localhost:5173", "http://127.0.0.1:5173"] : [])].filter((value): value is string => Boolean(value)))];
}

export function registerMusicActivitySockets(
  httpServer: HttpServer,
  env: Env,
  auth: ActivityAuthenticator,
  service: MusicActivityService
): void {
  const origins = allowedOrigins(env);
  const io = new SocketIOServer<ActivityClientToServerEvents, ActivityServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    path: "/socket.io",
    maxHttpBufferSize: 100_000,
    cors: {
      origin: (origin, callback) => {
        if (!origin || origins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error("Origin not allowed."));
        }
      },
      credentials: false
    }
  });

  io.use((socket, next) => {
    try {
      const token = typeof socket.handshake.auth.sessionToken === "string" ? socket.handshake.auth.sessionToken : "";
      socket.data.identity = auth.verify(token);
      next();
    } catch (error) {
      next(new Error(toError(error).message));
    }
  });

  const room = (roomId: string) => `activity:${roomId}`;
  service.onStateChange((state) => io.to(room(state.roomId)).emit("session:state", state));
  service.onParticipantJoined((participant, roomId) => {
    if (participant) {
      io.to(room(roomId)).emit("session:user-joined", participant);
    }
  });
  service.onParticipantLeft((userId, roomId) => io.to(room(roomId)).emit("session:user-left", userId));

  io.on("connection", (socket: ActivitySocket) => {
    const identity = socket.data.identity;
    socket.join(room(identity.roomId));

    socket.on("session:join", (ack) => run(ack, () => service.join(identity, socket.id)));
    socket.on("sync:request", (ack) => run(ack, () => service.getState(identity)));
    socket.on("queue:add", (payload, ack) => run(ack, () => {
      const item = mediaItemSchema.parse(payload.item) as ActivityMediaItem;
      return service.add(identity, auth.verifyMedia(item, identity));
    }));
    socket.on("queue:remove", (payload, ack) => run(ack, () => service.remove(identity, queueItemIdSchema.parse(payload).queueItemId)));
    socket.on("queue:reorder", (payload, ack) => run(ack, () => service.reorder(identity, queueOrderSchema.parse(payload).queueItemIds)));
    socket.on("queue:clear", (ack) => run(ack, () => service.clear(identity)));
    socket.on("queue:play-next", (payload, ack) => run(ack, () => service.playNext(identity, queueItemIdSchema.parse(payload).queueItemId)));
    socket.on("player:play", (ack) => run(ack, () => service.play(identity)));
    socket.on("player:pause", (payload, ack) => run(ack, () => service.pause(identity, positionSchema.parse(payload).positionSeconds)));
    socket.on("player:seek", (payload, ack) => run(ack, () => service.seek(identity, positionSchema.parse(payload).positionSeconds)));
    socket.on("player:next", (ack) => run(ack, () => service.next(identity)));
    socket.on("player:previous", (ack) => run(ack, () => service.previous(identity)));
    socket.on("player:ended", (payload, ack) => run(ack, () => service.ended(identity, endedSchema.parse(payload).queueItemId)));
    socket.on("settings:shuffle", (payload, ack) => run(ack, () => service.setShuffle(identity, booleanSchema.parse(payload).enabled)));
    socket.on("settings:repeat", (payload, ack) => run(ack, () => service.setRepeat(identity, repeatSchema.parse(payload).mode)));
    socket.on("settings:collaboration", (payload, ack) => run(ack, () => service.setCollaboration(identity, booleanSchema.parse(payload).enabled)));
    socket.on("host:transfer", (payload, ack) => run(ack, () => service.transferHost(identity, transferSchema.parse(payload).userId)));

    socket.on("disconnect", () => {
      service.leave(identity, socket.id);
    });
  });

  logger.info({ allowedOriginCount: origins.length }, "Music Activity Socket.IO gateway listening");
}
