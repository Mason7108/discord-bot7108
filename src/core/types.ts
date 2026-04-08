import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  Client,
  Collection,
  PermissionResolvable,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder
} from "discord.js";
import type { DisTube } from "distube";

export type ModuleName =
  | "moderation"
  | "logging"
  | "utility"
  | "economy"
  | "leveling"
  | "music"
  | "tickets"
  | "giveaways"
  | "fun"
  | "admin";

export type RoleRequirement = "Admin" | "Moderator" | "Helper" | "User";

export interface AutoModSettings {
  enabled: boolean;
  antiSpam: boolean;
  antiRaid: boolean;
  linkFilter: boolean;
  capsFilter: boolean;
  blacklist: string[];
  spamThreshold: number;
  spamIntervalSec: number;
  maxCapsRatio: number;
}

export interface RolePolicy {
  adminRoleIds: string[];
  moderatorRoleIds: string[];
  helperRoleIds: string[];
}

export interface GuildSettingsShape {
  guildId: string;
  modules: Record<ModuleName, boolean>;
  modLogChannelId?: string;
  automod: AutoModSettings;
  ticketCategoryId?: string;
  staffRoleIds: string[];
  levelRoles: Array<{ level: number; roleId: string }>;
  economyEnabled: boolean;
  music247Enabled: boolean;
  rolePolicy: RolePolicy;
}

export interface UserProfileShape {
  guildId: string;
  userId: string;
  xp: number;
  level: number;
  coins: number;
  inventory: string[];
  warnings: Array<{ moderatorId: string; reason: string; createdAt: Date }>;
  lastDailyAt?: Date;
  lastWorkAt?: Date;
}

export interface GiveawayEntryShape {
  guildId: string;
  channelId: string;
  messageId: string;
  prize: string;
  winnerCount: number;
  endsAt: Date;
  entrants: string[];
  status: "active" | "ended" | "deleted";
  winners: string[];
}

export interface TicketRecordShape {
  guildId: string;
  channelId: string;
  ownerId: string;
  status: "open" | "closed";
  createdAt: Date;
  closedAt?: Date;
  transcriptUrl?: string;
}

export interface ReminderShape {
  guildId: string;
  channelId: string;
  userId: string;
  text: string;
  dueAt: Date;
  delivered: boolean;
}

export interface CommandContext {
  client: BotClient;
  interaction: ChatInputCommandInteraction;
  settings: GuildSettingsShape;
}

export interface CommandDefinition {
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder;
  module: ModuleName;
  cooldownSec?: number;
  userPerms?: PermissionResolvable[];
  botPerms?: PermissionResolvable[];
  roleRequirement?: RoleRequirement;
  execute: (ctx: CommandContext) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

export interface EventDefinition {
  name: string;
  once?: boolean;
  execute: (client: BotClient, ...args: unknown[]) => Promise<void>;
}

export type CooldownStore = Collection<string, Collection<string, number>>;

export interface BotClient extends Client {
  commands: Collection<string, CommandDefinition>;
  cooldowns: CooldownStore;
  distube?: DisTube;
}
