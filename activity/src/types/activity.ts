export type ActivityMediaSource = "youtube" | "spotify" | "upload";
export type ActivityPlaybackKind = "youtube" | "audio" | "none";
export type ActivityRepeatMode = "off" | "one" | "all";

export interface ActivityUser {
  id: string;
  username: string;
  avatarUrl?: string;
}

export interface ActivityIdentity extends ActivityUser {
  roomId: string;
  guildId?: string;
  channelId?: string;
  instanceId?: string;
  expiresAt: number;
  development?: boolean;
}

export interface ActivityMediaItem {
  id: string;
  source: ActivityMediaSource;
  sourceId: string;
  playbackKind: ActivityPlaybackKind;
  title: string;
  creator: string;
  collection?: string;
  thumbnailUrl?: string;
  durationSeconds: number;
  url: string;
  embeddable?: boolean;
  metadataOnly?: boolean;
  uploadedByUserId?: string;
  proof?: string;
}

export interface ActivityQueueItem extends ActivityMediaItem {
  queueItemId: string;
  addedBy: ActivityUser;
  addedAt: number;
}

export interface ActivityParticipant extends ActivityUser {
  joinedAt: number;
  host: boolean;
}

export interface ActivitySessionState {
  roomId: string;
  guildId?: string;
  channelId?: string;
  instanceId?: string;
  nowPlaying?: ActivityQueueItem;
  queue: ActivityQueueItem[];
  history: ActivityQueueItem[];
  playing: boolean;
  positionSeconds: number;
  durationSeconds: number;
  updatedAt: number;
  repeatMode: ActivityRepeatMode;
  shuffle: boolean;
  collaborationEnabled: boolean;
  hostUserId?: string;
  listeners: ActivityParticipant[];
  revision: number;
}

export interface ActivitySearchPage {
  items: ActivityMediaItem[];
  nextPageToken?: string;
}

export interface ActivityAuthResult {
  sessionToken: string;
  discordAccessToken?: string;
  identity: ActivityIdentity;
}

export interface ActivityError {
  code: string;
  message: string;
}

export type ActivityAck<T> = { ok: true; data: T } | { ok: false; error: ActivityError };

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "offline";

export interface ResolvedActivitySession {
  auth: ActivityAuthResult;
  channelName?: string;
  source: "discord" | "browser";
}
