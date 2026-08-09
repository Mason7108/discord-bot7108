import { z } from "zod";
import { MODULE_NAMES } from "../core/constants.js";

export const discordIdSchema = z.string().regex(/^\d{15,25}$/, "Must be a Discord snowflake ID.");
const optionalDiscordIdSchema = z.union([discordIdSchema, z.literal(""), z.undefined()]).transform((value) => value || undefined);
const shortTextSchema = z.string().trim().min(1).max(300);
const templateSchema = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .refine((value) => !/[<>]/.test(value), "Templates cannot contain HTML.");

export const modulesSettingsSchema = z.object(
  Object.fromEntries(MODULE_NAMES.map((name) => [name, z.boolean().optional()])) as Record<(typeof MODULE_NAMES)[number], z.ZodOptional<z.ZodBoolean>>
);

export const automodSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  antiSpam: z.boolean().optional(),
  antiRaid: z.boolean().optional(),
  discordInviteFilter: z.boolean().optional(),
  linkFilter: z.boolean().optional(),
  capsFilter: z.boolean().optional(),
  blacklist: z
    .array(z.string().trim().min(1).max(80).refine((value) => !/[<>]/.test(value), "Blocked words cannot contain HTML."))
    .max(100)
    .optional(),
  spamThreshold: z.number().int().min(2).max(20).optional(),
  spamIntervalSec: z.number().int().min(3).max(120).optional(),
  maxCapsRatio: z.number().min(0.4).max(1).optional()
});

const logCategorySchema = z.object({
  enabled: z.boolean(),
  channelId: optionalDiscordIdSchema
});

export const loggingSettingsSchema = z.object({
  moderation: logCategorySchema.optional(),
  messageDelete: logCategorySchema.optional(),
  messageEdit: logCategorySchema.optional(),
  memberJoin: logCategorySchema.optional(),
  memberLeave: logCategorySchema.optional(),
  roleUpdates: logCategorySchema.optional(),
  channelUpdates: logCategorySchema.optional(),
  voiceActivity: logCategorySchema.optional(),
  dashboard: logCategorySchema.optional(),
  automod: logCategorySchema.optional()
});

export const welcomeSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  channelId: optionalDiscordIdSchema,
  message: templateSchema.optional(),
  goodbyeEnabled: z.boolean().optional(),
  goodbyeChannelId: optionalDiscordIdSchema,
  goodbyeMessage: templateSchema.optional(),
  dmEnabled: z.boolean().optional(),
  dmMessage: templateSchema.optional(),
  roleId: optionalDiscordIdSchema
});

export const musicSettingsSchema = z.object({
  music247Enabled: z.boolean().optional(),
  defaultVolume: z.number().int().min(1).max(100).optional(),
  maximumQueueLength: z.number().int().min(1).max(500).optional(),
  controllerChannelId: optionalDiscordIdSchema,
  djRoleId: optionalDiscordIdSchema,
  allowUserPlaylists: z.boolean().optional(),
  leaveWhenEmpty: z.boolean().optional(),
  idleDisconnectSeconds: z.number().int().min(30).max(3600).optional()
});

export const ticketSettingsSchema = z.object({
  ticketCategoryId: optionalDiscordIdSchema,
  ticketHistoryChannelId: optionalDiscordIdSchema,
  openingChannelId: optionalDiscordIdSchema,
  welcomeMessage: shortTextSchema.optional(),
  maxOpenTicketsPerUser: z.number().int().min(1).max(10).optional(),
  closeConfirmation: z.boolean().optional(),
  transcriptsEnabled: z.boolean().optional(),
  staffRoleIds: z.array(discordIdSchema).max(25).optional()
});

export const rolePolicySchema = z.object({
  adminRoleIds: z.array(discordIdSchema).max(25).optional(),
  moderatorRoleIds: z.array(discordIdSchema).max(25).optional(),
  helperRoleIds: z.array(discordIdSchema).max(25).optional()
});

export const dashboardSettingsPatchSchema = z
  .object({
    modules: modulesSettingsSchema.optional(),
    automod: automodSettingsSchema.optional(),
    logging: loggingSettingsSchema.optional(),
    welcome: welcomeSettingsSchema.optional(),
    music: musicSettingsSchema.optional(),
    tickets: ticketSettingsSchema.optional(),
    rolePolicy: rolePolicySchema.optional()
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), "At least one settings section is required.");

export const commandOverrideSchema = z.object({
  enabled: z.boolean().optional(),
  allowedRoleIds: z.array(discordIdSchema).max(25).optional(),
  allowedChannelIds: z.array(discordIdSchema).max(25).optional(),
  cooldownSec: z.number().int().min(0).max(3600).optional()
});

export const supportSubmissionSchema = z.object({
  kind: z.enum(["support", "bug", "feature"]),
  name: z.string().trim().min(2).max(80),
  contact: z.string().trim().min(3).max(160),
  discordUserId: z.union([discordIdSchema, z.literal(""), z.undefined()]).transform((value) => value || undefined),
  guildId: z.union([discordIdSchema, z.literal(""), z.undefined()]).transform((value) => value || undefined),
  subject: z.string().trim().min(4).max(120),
  message: z.string().trim().min(20).max(3000),
  website: z.string().max(0).optional(),
  startedAt: z.number().int().optional()
});

export const moderationActionSchema = z.object({
  action: z.enum(["warn", "remove_warning", "timeout", "untimeout", "kick", "ban", "unban", "purge", "lock", "unlock", "slowmode"]),
  targetUserId: z.union([discordIdSchema, z.literal(""), z.undefined()]).transform((value) => value || undefined),
  channelId: z.union([discordIdSchema, z.literal(""), z.undefined()]).transform((value) => value || undefined),
  reason: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
  durationSeconds: z.number().int().min(60).max(2_419_200).optional(),
  messageCount: z.number().int().min(1).max(100).optional(),
  warningIndex: z.number().int().min(0).max(999).optional(),
  confirm: z.boolean().optional()
});

export const ownerMessageSchema = z.object({
  guildId: discordIdSchema,
  channelId: discordIdSchema,
  content: z.string().trim().min(1).max(2000).refine((value) => !value.includes("\u0000"), "Message contains invalid characters.")
});

export const ownerPresenceSchema = z.object({
  presenceStatus: z.enum(["online", "idle", "dnd", "invisible"]),
  activityType: z.enum(["playing", "listening", "watching", "competing"]),
  activityText: z
    .string()
    .trim()
    .max(128)
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Activity text cannot contain control characters.")
});

export const ownerProfileSchema = z.object({
  username: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Username cannot contain control characters.")
});

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ");
}
