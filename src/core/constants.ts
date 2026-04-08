import type { AutoModSettings, ModuleName, RolePolicy } from "./types.js";

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
  music: false,
  tickets: true,
  giveaways: true,
  fun: true,
  admin: true
};

export const DEFAULT_AUTOMOD: AutoModSettings = {
  enabled: true,
  antiSpam: true,
  antiRaid: true,
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

export const XP_COOLDOWN_MS = 15_000;
export const GIVEAWAY_SCAN_MS = 15_000;
export const REMINDER_SCAN_MS = 15_000;
