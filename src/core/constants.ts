import type {
  AutoModSettings,
  LoggingSettings,
  ModuleName,
  MusicSettings,
  RolePolicy,
  TicketSettings,
  VoiceCommandSettings,
  VoiceTextToSpeechSettings,
  WelcomeSettings
} from "./types.js";

export const MODULE_NAMES: ModuleName[] = [
  "moderation",
  "logging",
  "utility",
  "economy",
  "leveling",
  "music",
  "tickets",
  "giveaways",
  "fun",
  "admin"
];

export const DEFAULT_MODULE_STATE: Record<ModuleName, boolean> = {
  moderation: true,
  logging: true,
  utility: true,
  economy: true,
  leveling: true,
  music: true,
  tickets: true,
  giveaways: true,
  fun: true,
  admin: true
};

export const DEFAULT_AUTOMOD: AutoModSettings = {
  enabled: true,
  antiSpam: true,
  antiRaid: true,
  discordInviteFilter: true,
  linkFilter: false,
  capsFilter: true,
  blacklist: [],
  spamThreshold: 6,
  spamIntervalSec: 8,
  maxCapsRatio: 0.7
};

export const DEFAULT_ROLE_POLICY: RolePolicy = {
  adminRoleIds: [],
  moderatorRoleIds: [],
  helperRoleIds: []
};

export const DEFAULT_VOICE_COMMANDS: VoiceCommandSettings = {
  enabled: false
};

export const DEFAULT_VOICE_TEXT_TO_SPEECH: VoiceTextToSpeechSettings = {
  enabled: false
};

export const DEFAULT_WELCOME: WelcomeSettings = {
  enabled: false,
  message: "Welcome {user} to {server}. You are member #{memberCount}.",
  goodbyeEnabled: false,
  goodbyeMessage: "{username} left {server}.",
  dmEnabled: false,
  dmMessage: "Welcome to {server}, {username}.",
  channelId: undefined,
  goodbyeChannelId: undefined,
  roleId: undefined
};

const defaultLogCategory = (enabled = false) => ({ enabled, channelId: undefined });

export const DEFAULT_LOGGING: LoggingSettings = {
  moderation: defaultLogCategory(true),
  messageDelete: defaultLogCategory(false),
  messageEdit: defaultLogCategory(false),
  memberJoin: defaultLogCategory(true),
  memberLeave: defaultLogCategory(true),
  roleUpdates: defaultLogCategory(false),
  channelUpdates: defaultLogCategory(false),
  voiceActivity: defaultLogCategory(false),
  dashboard: defaultLogCategory(true),
  automod: defaultLogCategory(true)
};

export const DEFAULT_MUSIC_SETTINGS: MusicSettings = {
  defaultVolume: 50,
  maximumQueueLength: 100,
  controllerChannelId: undefined,
  djRoleId: undefined,
  allowUserPlaylists: true,
  leaveWhenEmpty: true,
  idleDisconnectSeconds: 120
};

export const DEFAULT_TICKET_SETTINGS: TicketSettings = {
  openingChannelId: undefined,
  welcomeMessage: "Thank you for contacting support. Please describe your issue and wait for a response.",
  maxOpenTicketsPerUser: 1,
  closeConfirmation: true,
  transcriptsEnabled: true
};

export const XP_COOLDOWN_MS = 15_000;
export const GIVEAWAY_SCAN_MS = 15_000;
export const REMINDER_SCAN_MS = 15_000;
