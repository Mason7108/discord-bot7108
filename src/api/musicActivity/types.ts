export type ActivityMediaSource = "youtube" | "spotify" | "upload";
export type ActivityPlaybackKind = "youtube" | "audio" | "none";
export type ActivityRepeatMode = "off" | "one" | "all";

export interface ActivityUser {
  id: string;
  username: string;
  avatarUrl?: string;
}

export interface ActivityScope {
  roomId: string;
  guildId?: string;
  channelId?: string;
  instanceId?: string;
}

export interface ActivityIdentity extends ActivityUser, ActivityScope {
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

export interface ActivitySessionState extends ActivityScope {
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

export interface ActivityClientToServerEvents {
  "session:join": (ack?: (response: ActivityAck<ActivitySessionState>) => void) => void;
  "sync:request": (ack?: (response: ActivityAck<ActivitySessionState>) => void) => void;
  "queue:add": (payload: { item: ActivityMediaItem }, ack?: (response: ActivityAck<ActivitySessionState>) => void) => void;
  "queue:remove": (payload: { queueItemId: string }, ack?: (response: ActivityAck<ActivitySessionState>) => void) => void;
  "queue:reorder": (payload: { queueItemIds: string[] }, ack?: (response: ActivityAck<ActivitySessionState>) => void) => void;
  "queue:clear": (ack?: (response: ActivityAck<ActivitySessionState>) => void) => void;
  "queue:play-next": (payload: { queueItemId: string }, ack?: (response: ActivityAck<ActivitySessionState>) => void) => void;
  "player:play": (ack?: (response: ActivityAck<ActivitySessionState>) => void) => void;
  "player:pause": (payload: { positionSeconds: number }, ack?: (response: ActivityAck<ActivitySessionState>) => void) => void;
  "player:seek": (payload: { positionSeconds: number }, ack?: (response: ActivityAck<ActivitySessionState>) => void) => void;
  "player:next": (ack?: (response: ActivityAck<ActivitySessionState>) => void) => void;
  "player:previous": (ack?: (response: ActivityAck<ActivitySessionState>) => void) => void;
  "player:ended": (payload: { queueItemId: string }, ack?: (response: ActivityAck<ActivitySessionState>) => void) => void;
  "settings:shuffle": (payload: { enabled: boolean }, ack?: (response: ActivityAck<ActivitySessionState>) => void) => void;
  "settings:repeat": (payload: { mode: ActivityRepeatMode }, ack?: (response: ActivityAck<ActivitySessionState>) => void) => void;
  "settings:collaboration": (payload: { enabled: boolean }, ack?: (response: ActivityAck<ActivitySessionState>) => void) => void;
  "host:transfer": (payload: { userId: string }, ack?: (response: ActivityAck<ActivitySessionState>) => void) => void;
}

export interface ActivityServerToClientEvents {
  "session:state": (state: ActivitySessionState) => void;
  "session:user-joined": (user: ActivityParticipant) => void;
  "session:user-left": (userId: string) => void;
  "sync:state": (state: ActivitySessionState) => void;
  error: (error: ActivityError) => void;
}
