import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type {
  ActivityIdentity,
  ActivityMediaItem,
  ActivityParticipant,
  ActivityQueueItem,
  ActivityRepeatMode,
  ActivitySessionState,
  ActivityUser
} from "./types.js";

type ListenerConnection = ActivityUser & { socketId: string; joinedAt: number };
type StoredSession = ActivitySessionState & { connections: Map<string, ListenerConnection> };

export class ActivityCommandError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ActivityCommandError";
  }
}

function cloneState(session: StoredSession): ActivitySessionState {
  const { connections: _connections, ...state } = session;
  return structuredClone(state);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function sameSet(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

export function expectedPosition(state: Pick<ActivitySessionState, "playing" | "positionSeconds" | "updatedAt" | "durationSeconds">, now = Date.now()): number {
  const elapsed = state.playing ? Math.max(0, now - state.updatedAt) / 1000 : 0;
  return clamp(state.positionSeconds + elapsed, 0, state.durationSeconds);
}

export class MusicActivityService {
  private readonly sessions = new Map<string, StoredSession>();
  private readonly events = new EventEmitter();

  onStateChange(listener: (state: ActivitySessionState) => void): () => void {
    this.events.on("state", listener);
    return () => this.events.off("state", listener);
  }

  getState(identity: ActivityIdentity): ActivitySessionState {
    return cloneState(this.ensureSession(identity));
  }

  join(identity: ActivityIdentity, socketId: string): ActivitySessionState {
    const session = this.ensureSession(identity);
    const wasPresent = [...session.connections.values()].some((connection) => connection.id === identity.id);
    session.connections.set(socketId, {
      id: identity.id,
      username: identity.username,
      avatarUrl: identity.avatarUrl,
      socketId,
      joinedAt: Date.now()
    });

    if (!session.hostUserId) {
      session.hostUserId = identity.id;
    }

    this.syncListeners(session);
    const state = this.commit(session);
    if (!wasPresent) {
      this.events.emit("joined", state.listeners.find((listener) => listener.id === identity.id), state.roomId);
    }
    return state;
  }

  leave(identity: ActivityIdentity, socketId: string): ActivitySessionState {
    const session = this.ensureSession(identity);
    const leaving = session.connections.get(socketId);
    session.connections.delete(socketId);
    const remains = leaving && [...session.connections.values()].some((connection) => connection.id === leaving.id);

    if (session.hostUserId && ![...session.connections.values()].some((connection) => connection.id === session.hostUserId)) {
      session.hostUserId = [...session.connections.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0]?.id;
    }

    this.syncListeners(session);
    const state = this.commit(session);
    if (leaving && !remains) {
      this.events.emit("left", leaving.id, state.roomId);
    }
    return state;
  }

  onParticipantJoined(listener: (participant: ActivityParticipant, roomId: string) => void): void {
    this.events.on("joined", listener);
  }

  onParticipantLeft(listener: (userId: string, roomId: string) => void): void {
    this.events.on("left", listener);
  }

  add(identity: ActivityIdentity, item: ActivityMediaItem): ActivitySessionState {
    const session = this.ensureSession(identity);
    this.requireQueuePermission(session, identity);
    const queued = this.toQueueItem(item, identity);

    if (!session.nowPlaying) {
      session.nowPlaying = queued;
      session.durationSeconds = queued.durationSeconds;
      session.positionSeconds = 0;
      session.playing = false;
    } else {
      session.queue.push(queued);
    }
    return this.commit(session);
  }

  remove(identity: ActivityIdentity, queueItemId: string): ActivitySessionState {
    const session = this.ensureSession(identity);
    this.requireQueuePermission(session, identity);
    const before = session.queue.length;
    session.queue = session.queue.filter((item) => item.queueItemId !== queueItemId);
    if (before === session.queue.length) {
      throw new ActivityCommandError("QUEUE_ITEM_NOT_FOUND", "That queue item no longer exists.");
    }
    return this.commit(session);
  }

  reorder(identity: ActivityIdentity, queueItemIds: string[]): ActivitySessionState {
    const session = this.ensureSession(identity);
    this.requireHost(session, identity);
    const existingIds = session.queue.map((item) => item.queueItemId);
    if (!sameSet(queueItemIds, existingIds)) {
      throw new ActivityCommandError("INVALID_QUEUE_ORDER", "Queue order must contain every current queue item exactly once.");
    }
    const byId = new Map(session.queue.map((item) => [item.queueItemId, item]));
    session.queue = queueItemIds.map((id) => byId.get(id) as ActivityQueueItem);
    return this.commit(session);
  }

  clear(identity: ActivityIdentity): ActivitySessionState {
    const session = this.ensureSession(identity);
    this.requireHost(session, identity);
    session.queue = [];
    return this.commit(session);
  }

  playNext(identity: ActivityIdentity, queueItemId: string): ActivitySessionState {
    const session = this.ensureSession(identity);
    this.requireQueuePermission(session, identity);
    const index = session.queue.findIndex((item) => item.queueItemId === queueItemId);
    if (index < 0) {
      throw new ActivityCommandError("QUEUE_ITEM_NOT_FOUND", "That queue item no longer exists.");
    }
    const [item] = session.queue.splice(index, 1);
    session.queue.unshift(item);
    return this.commit(session);
  }

  play(identity: ActivityIdentity): ActivitySessionState {
    const session = this.ensureSession(identity);
    this.requireHost(session, identity);
    if (!session.nowPlaying) {
      throw new ActivityCommandError("QUEUE_EMPTY", "Add something to the queue first.");
    }
    if (session.nowPlaying.playbackKind === "none") {
      throw new ActivityCommandError("METADATA_ONLY", "Spotify entries are metadata only. Choose a YouTube video or uploaded audio to play.");
    }
    this.materialize(session);
    session.playing = true;
    return this.commit(session, false);
  }

  pause(identity: ActivityIdentity, positionSeconds: number): ActivitySessionState {
    const session = this.ensureSession(identity);
    this.requireHost(session, identity);
    session.positionSeconds = this.validPosition(session, positionSeconds);
    session.playing = false;
    return this.commit(session, false);
  }

  seek(identity: ActivityIdentity, positionSeconds: number): ActivitySessionState {
    const session = this.ensureSession(identity);
    this.requireHost(session, identity);
    session.positionSeconds = this.validPosition(session, positionSeconds);
    return this.commit(session, false);
  }

  next(identity: ActivityIdentity): ActivitySessionState {
    const session = this.ensureSession(identity);
    this.requireHost(session, identity);
    this.advance(session);
    return this.commit(session, false);
  }

  previous(identity: ActivityIdentity): ActivitySessionState {
    const session = this.ensureSession(identity);
    this.requireHost(session, identity);
    const previous = session.history.pop();
    if (!previous) {
      session.positionSeconds = 0;
      return this.commit(session, false);
    }
    if (session.nowPlaying) {
      session.queue.unshift(session.nowPlaying);
    }
    session.nowPlaying = previous;
    session.durationSeconds = previous.durationSeconds;
    session.positionSeconds = 0;
    session.playing = previous.playbackKind !== "none";
    return this.commit(session, false);
  }

  ended(identity: ActivityIdentity, queueItemId: string): ActivitySessionState {
    const session = this.ensureSession(identity);
    if (session.nowPlaying?.queueItemId !== queueItemId) {
      return cloneState(session);
    }
    if (expectedPosition(session) < Math.max(0, session.durationSeconds - 5)) {
      throw new ActivityCommandError("ENDED_TOO_EARLY", "The current item has not reached its end yet.");
    }
    this.advance(session);
    return this.commit(session, false);
  }

  setShuffle(identity: ActivityIdentity, enabled: boolean): ActivitySessionState {
    const session = this.ensureSession(identity);
    this.requireHost(session, identity);
    session.shuffle = enabled;
    return this.commit(session);
  }

  setRepeat(identity: ActivityIdentity, mode: ActivityRepeatMode): ActivitySessionState {
    const session = this.ensureSession(identity);
    this.requireHost(session, identity);
    session.repeatMode = mode;
    return this.commit(session);
  }

  setCollaboration(identity: ActivityIdentity, enabled: boolean): ActivitySessionState {
    const session = this.ensureSession(identity);
    this.requireHost(session, identity);
    session.collaborationEnabled = enabled;
    return this.commit(session);
  }

  transferHost(identity: ActivityIdentity, userId: string): ActivitySessionState {
    const session = this.ensureSession(identity);
    this.requireHost(session, identity);
    if (!session.listeners.some((listener) => listener.id === userId)) {
      throw new ActivityCommandError("LISTENER_NOT_FOUND", "That listener is no longer connected.");
    }
    session.hostUserId = userId;
    this.syncListeners(session);
    return this.commit(session);
  }

  isHost(identity: ActivityIdentity): boolean {
    return this.ensureSession(identity).hostUserId === identity.id;
  }

  private ensureSession(identity: ActivityIdentity): StoredSession {
    const existing = this.sessions.get(identity.roomId);
    if (existing) {
      return existing;
    }
    const now = Date.now();
    const session: StoredSession = {
      roomId: identity.roomId,
      guildId: identity.guildId,
      channelId: identity.channelId,
      instanceId: identity.instanceId,
      queue: [],
      history: [],
      playing: false,
      positionSeconds: 0,
      durationSeconds: 0,
      updatedAt: now,
      repeatMode: "off",
      shuffle: false,
      collaborationEnabled: true,
      listeners: [],
      revision: 0,
      connections: new Map()
    };
    this.sessions.set(identity.roomId, session);
    return session;
  }

  private syncListeners(session: StoredSession): void {
    const byUser = new Map<string, ListenerConnection>();
    for (const connection of [...session.connections.values()].sort((a, b) => a.joinedAt - b.joinedAt)) {
      if (!byUser.has(connection.id)) {
        byUser.set(connection.id, connection);
      }
    }
    session.listeners = [...byUser.values()].map(({ socketId: _socketId, ...listener }) => ({
      ...listener,
      host: listener.id === session.hostUserId
    }));
  }

  private materialize(session: StoredSession): void {
    session.positionSeconds = expectedPosition(session);
  }

  private commit(session: StoredSession, materialize = true): ActivitySessionState {
    if (materialize) {
      this.materialize(session);
    }
    session.updatedAt = Date.now();
    session.revision += 1;
    const state = cloneState(session);
    this.events.emit("state", state);
    return state;
  }

  private requireHost(session: StoredSession, identity: ActivityIdentity): void {
    if (session.hostUserId !== identity.id) {
      throw new ActivityCommandError("HOST_ONLY", "Only the session host can use that shared control.");
    }
  }

  private requireQueuePermission(session: StoredSession, identity: ActivityIdentity): void {
    if (session.hostUserId !== identity.id && !session.collaborationEnabled) {
      throw new ActivityCommandError("QUEUE_LOCKED", "The host has disabled collaborative queue changes.");
    }
  }

  private validPosition(session: StoredSession, positionSeconds: number): number {
    if (!Number.isFinite(positionSeconds)) {
      throw new ActivityCommandError("INVALID_POSITION", "Playback position must be a finite number.");
    }
    return clamp(positionSeconds, 0, session.durationSeconds);
  }

  private toQueueItem(item: ActivityMediaItem, identity: ActivityIdentity): ActivityQueueItem {
    return {
      ...structuredClone(item),
      queueItemId: randomUUID(),
      addedBy: { id: identity.id, username: identity.username, avatarUrl: identity.avatarUrl },
      addedAt: Date.now()
    };
  }

  private advance(session: StoredSession): void {
    const current = session.nowPlaying;
    if (current) {
      session.history.push(current);
    }
    if (session.repeatMode === "one" && current) {
      session.positionSeconds = 0;
      session.playing = current.playbackKind !== "none";
      return;
    }
    if (session.repeatMode === "all" && current) {
      session.queue.push(current);
    }
    const index = session.shuffle && session.queue.length > 1 ? Math.floor(Math.random() * session.queue.length) : 0;
    const [next] = session.queue.splice(index, 1);
    session.nowPlaying = next;
    session.durationSeconds = next?.durationSeconds ?? 0;
    session.positionSeconds = 0;
    session.playing = Boolean(next && next.playbackKind !== "none");
  }
}

export function createMusicActivityService(): MusicActivityService {
  return new MusicActivityService();
}
