import {
  ChannelType,
  EmbedBuilder,
  PermissionsBitField,
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type TextChannel
} from "discord.js";
import type { Express, NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import multer from "multer";
import crypto from "node:crypto";
import type { Env } from "../config/env.js";
import { MODULE_NAMES } from "../core/constants.js";
import {
  applyBotPresence,
  getBotControlSettings,
  saveBotControlSettings
} from "../core/services/botControlService.js";
import {
  evaluateCommandOverride,
  getCommandOverride,
  getCommandOverrides,
  isEssentialCommand,
  upsertCommandOverride
} from "../core/services/commandSettingsService.js";
import { recordDashboardAuditEvent } from "../core/services/dashboardAuditService.js";
import { getGuildSettings, updateGuildSettings } from "../core/services/guildSettingsService.js";
import { createModerationCase } from "../core/services/moderationCaseService.js";
import type { BotClient, CommandDefinition, GuildSettingsShape } from "../core/types.js";
import { DashboardAuditEventModel } from "../models/DashboardAuditEvent.js";
import { ModerationCaseModel } from "../models/ModerationCase.js";
import { SupportSubmissionModel } from "../models/SupportSubmission.js";
import { UserProfileModel } from "../models/UserProfile.js";
import { moderationActionEmbed, sendModLog } from "../systems/logging.js";
import { logger } from "../utils/logger.js";
import {
  buildBotInviteUrl,
  buildDashboardRedirectUri,
  consumeOAuthStateCookie,
  createDashboardSession,
  createOAuthStateCookie,
  destroyDashboardSession,
  getDashboardSecret,
  getOAuthClientSecret,
  isDiscordId,
  isDashboardOwner,
  requireCsrf,
  requireDashboardAuth,
  requireDashboardOwner,
  safeReturnTo,
  serializeDashboardUser,
  attachDashboardSession,
  type DashboardUser
} from "./dashboardSecurity.js";
import {
  canAssignRole,
  evaluateModerationTarget,
  hasManageGuildPermissionBits,
  hasRequiredPermissions,
  moderationPermissionsForAction,
  requireManageGuildAccess,
  serializeGuildIcon
} from "./dashboardPermissions.js";
import {
  commandOverrideSchema,
  dashboardSettingsPatchSchema,
  formatZodError,
  moderationActionSchema,
  ownerMessageSchema,
  ownerPresenceSchema,
  ownerProfileSchema,
  supportSubmissionSchema
} from "./dashboardValidation.js";
import { rateLimit } from "./rateLimit.js";

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function safeJsonError(res: Response, status: number, error: string): void {
  res.status(status).json({ ok: false, error });
}

const ownerAvatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowed = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
    callback(null, allowed.has(file.mimetype));
  }
});

function isSupportedAvatar(buffer: Buffer): boolean {
  const png = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const header = buffer.subarray(0, 12).toString("ascii");
  const gif = header.startsWith("GIF87a") || header.startsWith("GIF89a");
  const webp = header.startsWith("RIFF") && header.slice(8, 12) === "WEBP";
  return png || jpeg || gif || webp;
}

function serializeOwnerGuilds(client: BotClient) {
  return [...client.guilds.cache.values()]
    .map((guild) => {
      const botMember = guild.members.me;
      const channels = guild.channels.cache
        .filter((channel) => {
          if (!botMember || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
            return false;
          }
          return channel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]) === true;
        })
        .map((channel) => ({ id: channel.id, name: channel.name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return {
        id: guild.id,
        name: guild.name,
        iconUrl: serializeGuildIcon(guild),
        channels
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchDiscordJson<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "bot7108-dashboard/1.0"
    }
  });

  const json = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    throw new Error("Discord API request failed.");
  }

  return json;
}

function commandUsage(command: CommandDefinition): string {
  const json = command.data.toJSON() as {
    name: string;
    options?: Array<{ name: string; description?: string; required?: boolean; type?: number; options?: Array<{ name: string; required?: boolean }> }>;
  };

  const subcommands = (json.options ?? []).filter((option) => option.type === 1 || option.type === 2);
  if (subcommands.length > 0) {
    return `/${json.name} ${subcommands[0].name}`;
  }

  const args = (json.options ?? [])
    .filter((option) => option.type !== 1 && option.type !== 2)
    .map((option) => (option.required ? `<${option.name}>` : `[${option.name}]`));

  return [`/${json.name}`, ...args].join(" ");
}

function serializeCommand(command: CommandDefinition, override?: Awaited<ReturnType<typeof getCommandOverride>>) {
  const json = command.data.toJSON() as {
    name: string;
    description: string;
    options?: unknown[];
  };

  return {
    name: json.name,
    description: json.description,
    category: command.module,
    requiredPermissions: command.userPerms ? new PermissionsBitField(command.userPerms).toArray() : [],
    botPermissions: command.botPerms ? new PermissionsBitField(command.botPerms).toArray() : [],
    usage: commandUsage(command),
    slashFormat: `/${json.name}`,
    enabled: override?.enabled ?? true,
    essential: isEssentialCommand(json.name),
    cooldownSec: override?.cooldownSec ?? command.cooldownSec ?? 0,
    allowedRoleIds: override?.allowedRoleIds ?? [],
    allowedChannelIds: override?.allowedChannelIds ?? [],
    options: json.options ?? []
  };
}

function publicFeatureCatalog() {
  return [
    { category: "Moderation", status: "Available", detail: "Warns, timeouts, kicks, bans, unbans, purge, slowmode, lock/unlock, mod logs." },
    { category: "Music", status: "Available", detail: "DisTube playback, queue, pause/resume, skip, volume, 24/7 mode, and MP3 attachments." },
    { category: "Utilities", status: "Available", detail: "Ping, server info, user info, avatar, reminders, polls, math, voice-channel tools." },
    { category: "Welcome and goodbye messages", status: "Available", detail: "Dashboard-configurable channel messages, DMs, placeholders, and optional role assignment." },
    { category: "Logging", status: "Available", detail: "Moderation, automod, dashboard, message edit/delete, and member join/leave categories." },
    { category: "Automod", status: "Available", detail: "Invite filtering, link filtering, spam checks, anti-raid spike detection, caps checks, blocked words." },
    { category: "Reaction roles", status: "Coming Soon", detail: "The bot does not currently include a reaction-role handler." },
    { category: "Server statistics", status: "Partial", detail: "Dashboard overview shows server, command, and moderation totals when available." },
    { category: "Custom commands", status: "Coming Soon", detail: "The bot does not currently include a custom text-command executor." },
    { category: "Giveaways", status: "Available", detail: "Start, end, reroll, delete, join button, and automatic winner selection." },
    { category: "Polls", status: "Available", detail: "Slash-command poll creation is available in the utility module." },
    { category: "Tickets", status: "Available", detail: "Ticket setup, close, claim, transcripts, ticket history, and staff role access." },
    { category: "Suggestions", status: "Coming Soon", detail: "The bot does not currently include a suggestions workflow." }
  ];
}

function mergeLoggingSettings(current: GuildSettingsShape, incoming: NonNullable<ReturnType<typeof dashboardSettingsPatchSchema.safeParse>["data"]>["logging"]) {
  if (!incoming) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(current.logging).map(([key, value]) => {
      const next = (incoming as Partial<Record<keyof GuildSettingsShape["logging"], GuildSettingsShape["logging"][keyof GuildSettingsShape["logging"]]>>)[
        key as keyof GuildSettingsShape["logging"]
      ];
      return [
        key,
        {
          ...value,
          ...(next ?? {})
        }
      ];
    })
  ) as GuildSettingsShape["logging"];
}

function buildSettingsPatch(current: GuildSettingsShape, body: unknown): Partial<GuildSettingsShape> {
  const parsed = dashboardSettingsPatchSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error));
  }

  const input = parsed.data;
  const patch: Partial<GuildSettingsShape> = {};

  if (input.modules) {
    patch.modules = { ...current.modules, ...input.modules };
  }

  if (input.automod) {
    patch.automod = {
      ...current.automod,
      ...input.automod,
      blacklist: input.automod.blacklist ? [...new Set(input.automod.blacklist.map((word) => word.trim()).filter(Boolean))] : current.automod.blacklist
    };
  }

  if (input.welcome) {
    patch.welcome = { ...current.welcome, ...input.welcome };
  }

  const logging = mergeLoggingSettings(current, input.logging);
  if (logging) {
    patch.logging = logging;
  }

  if (input.tickets) {
    patch.ticketCategoryId = input.tickets.ticketCategoryId;
    patch.ticketHistoryChannelId = input.tickets.ticketHistoryChannelId;
    patch.staffRoleIds = input.tickets.staffRoleIds ?? current.staffRoleIds;
    patch.ticketSettings = {
      ...current.ticketSettings,
      openingChannelId: input.tickets.openingChannelId ?? current.ticketSettings.openingChannelId,
      welcomeMessage: input.tickets.welcomeMessage ?? current.ticketSettings.welcomeMessage,
      maxOpenTicketsPerUser: input.tickets.maxOpenTicketsPerUser ?? current.ticketSettings.maxOpenTicketsPerUser,
      closeConfirmation: input.tickets.closeConfirmation ?? current.ticketSettings.closeConfirmation,
      transcriptsEnabled: input.tickets.transcriptsEnabled ?? current.ticketSettings.transcriptsEnabled
    };
  }

  if (input.music) {
    patch.music247Enabled = input.music.music247Enabled ?? current.music247Enabled;
    patch.musicSettings = {
      ...current.musicSettings,
      defaultVolume: input.music.defaultVolume ?? current.musicSettings.defaultVolume,
      maximumQueueLength: input.music.maximumQueueLength ?? current.musicSettings.maximumQueueLength,
      controllerChannelId: input.music.controllerChannelId ?? current.musicSettings.controllerChannelId,
      djRoleId: input.music.djRoleId ?? current.musicSettings.djRoleId,
      allowUserPlaylists: input.music.allowUserPlaylists ?? current.musicSettings.allowUserPlaylists,
      leaveWhenEmpty: input.music.leaveWhenEmpty ?? current.musicSettings.leaveWhenEmpty,
      idleDisconnectSeconds: input.music.idleDisconnectSeconds ?? current.musicSettings.idleDisconnectSeconds
    };
  }

  if (input.rolePolicy) {
    patch.rolePolicy = { ...current.rolePolicy, ...input.rolePolicy };
  }

  return patch;
}

function serializeChannels(guild: Guild) {
  return guild.channels.cache
    .filter((channel): channel is GuildBasedChannel => Boolean(channel))
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: ChannelType[channel.type] ?? String(channel.type),
      configurable: channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement,
      category: channel.type === ChannelType.GuildCategory
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function serializeRoles(guild: Guild, botRolePosition: number) {
  return guild.roles.cache
    .filter((role) => role.id !== guild.roles.everyone.id)
    .map((role) => ({
      id: role.id,
      name: role.name,
      color: role.hexColor,
      position: role.position,
      assignableByBot: role.position < botRolePosition
    }))
    .sort((a, b) => b.position - a.position);
}

async function guildDashboardContext(client: BotClient, req: Request, res: Response) {
  const guildId = req.params.guildId;
  if (!isDiscordId(guildId) || !req.dashboard) {
    safeJsonError(res, 400, "A valid server ID is required.");
    return null;
  }

  const access = await requireManageGuildAccess(client, guildId, req.dashboard.user.id);
  if (!access.ok) {
    safeJsonError(res, access.status, access.error);
    return null;
  }

  return access;
}

async function createDashboardModerationLog(input: {
  guild: Guild;
  settings: GuildSettingsShape;
  actionLabel: string;
  actor: DashboardUser;
  targetUserId?: string;
  targetTag?: string;
  reason: string;
}) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`Dashboard Moderation: ${input.actionLabel}`)
    .addFields(
      { name: "Moderator", value: `${input.actor.displayName} (${input.actor.id})`, inline: false },
      { name: "Target", value: input.targetUserId ? `${input.targetTag ?? "Unknown"} (${input.targetUserId})` : "Channel action", inline: false },
      { name: "Reason", value: input.reason || "No reason provided", inline: false }
    )
    .setTimestamp();

  await sendModLog(input.guild, input.settings, embed, "moderation").catch((error) => {
    logger.warn({ err: error, guildId: input.guild.id }, "Failed to send dashboard moderation log");
  });
}

async function createDashboardSettingsLog(input: {
  guild: Guild;
  settings: GuildSettingsShape;
  actor: DashboardUser;
  action: string;
  target: string;
}) {
  const embed = new EmbedBuilder()
    .setColor(0x22d3ee)
    .setTitle("Dashboard Change")
    .addFields(
      { name: "User", value: `${input.actor.displayName} (${input.actor.id})` },
      { name: "Action", value: input.action },
      { name: "Target", value: input.target }
    )
    .setTimestamp();

  await sendModLog(input.guild, input.settings, embed, "dashboard").catch((error) => {
    logger.warn({ err: error, guildId: input.guild.id }, "Failed to send dashboard settings log");
  });
}

async function handleModerationAction(client: BotClient, req: Request, res: Response): Promise<void> {
  const context = await guildDashboardContext(client, req, res);
  if (!context || !req.dashboard) {
    return;
  }

  const parsed = moderationActionSchema.safeParse(req.body);
  if (!parsed.success) {
    safeJsonError(res, 400, formatZodError(parsed.error));
    return;
  }

  const input = parsed.data;
  const permissions = moderationPermissionsForAction(input.action);
  if (permissions.destructive && input.confirm !== true) {
    safeJsonError(res, 400, "This moderation action requires confirmation.");
    return;
  }

  if (!hasRequiredPermissions(context.actor, permissions.user)) {
    safeJsonError(res, 403, "You do not have the required Discord permission for this action.");
    return;
  }

  if (!hasRequiredPermissions(context.botMember, permissions.bot)) {
    safeJsonError(res, 403, "bot7108 does not have the required Discord permission for this action.");
    return;
  }

  const settings = await getGuildSettings(context.guild.id);
  const reason = input.reason?.trim() || "No reason provided";
  let targetTag: string | undefined;
  let resultMessage = "Moderation action completed.";

  if (["warn", "remove_warning", "timeout", "untimeout", "kick", "ban"].includes(input.action)) {
    if (!input.targetUserId) {
      safeJsonError(res, 400, "A target user ID is required.");
      return;
    }

    const targetMember = await context.guild.members.fetch(input.targetUserId).catch(() => null);
    if (!targetMember) {
      safeJsonError(res, 404, "Target member was not found in this server.");
      return;
    }

    const targetCheck = evaluateModerationTarget({
      guild: context.guild,
      actor: context.actor,
      botMember: context.botMember,
      target: targetMember
    });
    if (!targetCheck.ok) {
      safeJsonError(res, 403, targetCheck.error);
      return;
    }

    targetTag = targetMember.user.tag;

    if (input.action === "warn") {
      const profile = await UserProfileModel.findOneAndUpdate(
        { guildId: context.guild.id, userId: targetMember.id },
        {
          $setOnInsert: { guildId: context.guild.id, userId: targetMember.id },
          $push: {
            warnings: {
              moderatorId: req.dashboard.user.id,
              reason,
              createdAt: new Date()
            }
          }
        },
        { upsert: true, new: true }
      );
      resultMessage = `Warning added. The member now has ${profile?.warnings.length ?? 1} warning(s).`;
    }

    if (input.action === "remove_warning") {
      const profile = await UserProfileModel.findOne({ guildId: context.guild.id, userId: targetMember.id });
      const index = input.warningIndex ?? -1;
      if (!profile || !profile.warnings[index]) {
        safeJsonError(res, 404, "Warning not found.");
        return;
      }
      profile.warnings.splice(index, 1);
      await profile.save();
      resultMessage = "Warning removed.";
    }

    if (input.action === "timeout") {
      if (!targetMember.moderatable || !input.durationSeconds) {
        safeJsonError(res, 400, "A valid timeout duration is required and the member must be moderatable.");
        return;
      }
      await targetMember.timeout(input.durationSeconds * 1_000, reason);
      resultMessage = "Member timed out.";
    }

    if (input.action === "untimeout") {
      if (!targetMember.moderatable) {
        safeJsonError(res, 400, "That member cannot be updated by bot7108.");
        return;
      }
      await targetMember.timeout(null, reason);
      resultMessage = "Timeout removed.";
    }

    if (input.action === "kick") {
      if (!targetMember.kickable) {
        safeJsonError(res, 403, "bot7108 cannot kick that member.");
        return;
      }
      await targetMember.kick(reason);
      resultMessage = "Member kicked.";
    }

    if (input.action === "ban") {
      if (!targetMember.bannable) {
        safeJsonError(res, 403, "bot7108 cannot ban that member.");
        return;
      }
      await context.guild.members.ban(targetMember.id, { reason });
      resultMessage = "Member banned.";
    }
  }

  if (input.action === "unban") {
    if (!input.targetUserId) {
      safeJsonError(res, 400, "A target user ID is required.");
      return;
    }

    const ban = await context.guild.bans.fetch(input.targetUserId).catch(() => null);
    if (!ban) {
      safeJsonError(res, 404, "No active ban was found for that user ID.");
      return;
    }
    targetTag = ban.user.tag;
    await context.guild.members.unban(input.targetUserId, reason);
    resultMessage = "User unbanned.";
  }

  if (["purge", "lock", "unlock", "slowmode"].includes(input.action)) {
    if (!input.channelId) {
      safeJsonError(res, 400, "A channel ID is required.");
      return;
    }

    const channel = await context.guild.channels.fetch(input.channelId).catch(() => null);
    if (!channel || !("type" in channel)) {
      safeJsonError(res, 404, "Channel not found.");
      return;
    }

    if (input.action === "purge") {
      if (!("bulkDelete" in channel) || typeof channel.bulkDelete !== "function" || !input.messageCount) {
        safeJsonError(res, 400, "This channel does not support purge or the message count is missing.");
        return;
      }
      const deleted = await channel.bulkDelete(input.messageCount, true);
      resultMessage = `Deleted ${deleted.size} recent message(s).`;
    }

    if (input.action === "lock" || input.action === "unlock") {
      if (!("permissionOverwrites" in channel)) {
        safeJsonError(res, 400, "This channel cannot be locked from the dashboard.");
        return;
      }
      await channel.permissionOverwrites.edit(context.guild.roles.everyone.id, {
        SendMessages: input.action === "lock" ? false : null
      });
      resultMessage = input.action === "lock" ? "Channel locked." : "Channel unlocked.";
    }

    if (input.action === "slowmode") {
      if (!("setRateLimitPerUser" in channel) || typeof channel.setRateLimitPerUser !== "function") {
        safeJsonError(res, 400, "This channel does not support slowmode.");
        return;
      }
      await channel.setRateLimitPerUser(input.durationSeconds ?? 0, reason);
      resultMessage = "Slowmode updated.";
    }
  }

  const moderationCase = await createModerationCase({
    guildId: context.guild.id,
    action: input.action,
    targetUserId: input.targetUserId,
    targetTag,
    moderatorUserId: req.dashboard.user.id,
    moderatorTag: req.dashboard.user.displayName,
    reason,
    notes: input.notes,
    channelId: input.channelId,
    durationSeconds: input.durationSeconds,
    messageCount: input.messageCount
  });

  await createDashboardModerationLog({
    guild: context.guild,
    settings,
    actionLabel: input.action,
    actor: req.dashboard.user,
    targetUserId: input.targetUserId,
    targetTag,
    reason
  });

  await recordDashboardAuditEvent({
    guildId: context.guild.id,
    actorUserId: req.dashboard.user.id,
    actorDisplayName: req.dashboard.user.displayName,
    action: `moderation.${input.action}`,
    targetType: input.targetUserId ? "user" : "channel",
    targetId: input.targetUserId ?? input.channelId,
    metadata: {
      caseNumber: moderationCase.caseNumber,
      reason,
      notes: input.notes
    }
  });

  res.json({ ok: true, message: resultMessage, caseNumber: moderationCase.caseNumber });
}

export function registerDashboardRoutes(app: Express, env: Env, client: BotClient): void {
  app.use((req, res, next) => {
    void attachDashboardSession(env, req, res, next);
  });
  const requireOwner = requireDashboardOwner(env, client);

  app.get("/api/public/config", (_req, res) => {
    res.json({
      ok: true,
      supportServerUrl: env.SUPPORT_SERVER_URL ?? null,
      inviteUrl: buildBotInviteUrl(env),
      features: publicFeatureCatalog()
    });
  });

  app.get("/api/public/status", (_req, res) => {
    const guilds = client.guilds.cache;
    const userCount = guilds.reduce((sum, guild) => sum + (guild.memberCount ?? 0), 0);
    res.json({
      ok: true,
      bot: {
        online: client.isReady(),
        latencyMs: Math.max(0, Math.round(client.ws.ping)),
        readyAt: client.readyAt?.toISOString() ?? null
      },
      api: {
        online: true,
        responseTimeMs: 0
      },
      database: {
        online: mongoose.connection.readyState === 1,
        status: ["disconnected", "connected", "connecting", "disconnecting"][mongoose.connection.readyState] ?? "unknown"
      },
      website: {
        online: true
      },
      stats: {
        servers: client.isReady() ? guilds.size : null,
        users: client.isReady() ? userCount : null,
        commands: client.commands?.size ?? null
      },
      lastUpdatedAt: new Date().toISOString()
    });
  });

  app.get("/api/public/commands", (_req, res) => {
    const commands = [...client.commands.values()].map((command) => serializeCommand(command));
    res.json({ ok: true, commands });
  });

  app.post(
    "/api/public/support",
    rateLimit("support-form", 5, 15 * 60 * 1_000),
    asyncHandler(async (req, res) => {
      const parsed = supportSubmissionSchema.safeParse(req.body);
      if (!parsed.success) {
        safeJsonError(res, 400, formatZodError(parsed.error));
        return;
      }

      const input = parsed.data;
      if (input.website && input.website.length > 0) {
        safeJsonError(res, 400, "Invalid form submission.");
        return;
      }

      if (input.startedAt && Date.now() - input.startedAt < 3000) {
        safeJsonError(res, 429, "Please wait a moment before submitting.");
        return;
      }

      await SupportSubmissionModel.create({
        kind: input.kind,
        name: input.name,
        contact: input.contact,
        discordUserId: input.discordUserId,
        guildId: input.guildId,
        subject: input.subject,
        message: input.message
      });

      res.status(201).json({ ok: true, message: "Submission received." });
    })
  );

  app.get(
    "/auth/dashboard/discord",
    rateLimit("dashboard-oauth-start", 20, 15 * 60 * 1_000),
    (req, res) => {
      const secret = getDashboardSecret(env);
      const clientSecret = getOAuthClientSecret(env);
      if (!secret || !clientSecret) {
        res.redirect("/unauthorized?reason=oauth-not-configured");
        return;
      }

      const state = crypto.randomBytes(24).toString("base64url");
      createOAuthStateCookie(env, res, {
        state,
        returnTo: safeReturnTo(req.query.returnTo),
        expiresAt: Date.now() + 10 * 60 * 1_000
      });

      const url = new URL("https://discord.com/api/oauth2/authorize");
      url.searchParams.set("client_id", env.CLIENT_ID);
      url.searchParams.set("redirect_uri", buildDashboardRedirectUri(env, req));
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", "identify guilds");
      url.searchParams.set("state", state);
      res.redirect(url.toString());
    }
  );

  app.get(
    "/auth/dashboard/discord/callback",
    rateLimit("dashboard-oauth-callback", 40, 15 * 60 * 1_000),
    asyncHandler(async (req, res) => {
      const clientSecret = getOAuthClientSecret(env);
      const code = typeof req.query.code === "string" ? req.query.code : undefined;
      const state = typeof req.query.state === "string" ? req.query.state : undefined;
      const savedState = consumeOAuthStateCookie(env, req, res);

      if (!clientSecret || !code || !state || !savedState || savedState.state !== state) {
        res.redirect("/unauthorized?reason=oauth-state");
        return;
      }

      const tokenBody = new URLSearchParams({
        client_id: env.CLIENT_ID,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: buildDashboardRedirectUri(env, req)
      });

      const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenBody
      });
      const token = (await tokenResponse.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
      if (!tokenResponse.ok || !token.access_token) {
        res.redirect("/unauthorized?reason=oauth-token");
        return;
      }

      const user = await fetchDiscordJson<{ id?: string; username?: string; global_name?: string | null; avatar?: string | null }>(
        "https://discord.com/api/users/@me",
        token.access_token
      );
      if (!isDiscordId(user.id) || !user.username) {
        res.redirect("/unauthorized?reason=oauth-user");
        return;
      }

      await createDashboardSession({ env, res, token, user });
      res.redirect(savedState.returnTo);
    })
  );

  app.get("/api/auth/me", (req, res) => {
    if (!req.dashboard) {
      res.json({ ok: true, authenticated: false });
      return;
    }

    res.json({
      ok: true,
      authenticated: true,
      user: {
        ...serializeDashboardUser(req.dashboard.user),
        isOwner: isDashboardOwner(env, client, req.dashboard.user.id)
      },
      csrfToken: req.dashboard.csrfToken
    });
  });

  app.post("/api/auth/logout", requireDashboardAuth, requireCsrf, asyncHandler(async (req, res) => {
    await destroyDashboardSession(req, res, env);
    res.json({ ok: true });
  }));

  app.get(
    "/api/auth/guilds",
    requireDashboardAuth,
    rateLimit("dashboard-guilds", 60, 60 * 1_000),
    asyncHandler(async (req, res) => {
      const guilds = await fetchDiscordJson<
        Array<{ id: string; name: string; icon?: string | null; owner?: boolean; permissions?: string }>
      >("https://discord.com/api/users/@me/guilds", req.dashboard!.accessToken);

      const manageable = guilds
        .filter((guild) => hasManageGuildPermissionBits(guild.permissions, guild.owner))
        .map((guild) => ({
          id: guild.id,
          name: guild.name,
          iconUrl: serializeGuildIcon(guild),
          installed: client.guilds.cache.has(guild.id),
          inviteUrl: buildBotInviteUrl(env, guild.id)
        }))
        .sort((a, b) => Number(b.installed) - Number(a.installed) || a.name.localeCompare(b.name));

      res.json({ ok: true, guilds: manageable });
    })
  );

  app.get(
    "/api/dashboard/owner/console",
    requireDashboardAuth,
    requireOwner,
    rateLimit("dashboard-owner-read", 60, 60 * 1_000),
    asyncHandler(async (_req, res) => {
      const botUser = client.user;
      if (!botUser || !client.isReady()) {
        safeJsonError(res, 503, "bot7108 is not ready.");
        return;
      }

      const [presence, recentAudit] = await Promise.all([
        getBotControlSettings(),
        DashboardAuditEventModel.find({ action: /^owner\./ }).sort({ createdAt: -1 }).limit(20).lean()
      ]);

      res.json({
        ok: true,
        bot: {
          id: botUser.id,
          username: botUser.username,
          avatarUrl: botUser.displayAvatarURL({ extension: "png", size: 256 })
        },
        presence,
        guilds: serializeOwnerGuilds(client),
        recentAudit: recentAudit.map((event) => ({
          id: String(event._id),
          action: event.action,
          actorDisplayName: event.actorDisplayName,
          targetType: event.targetType,
          targetId: event.targetId,
          createdAt: event.createdAt
        }))
      });
    })
  );

  app.post(
    "/api/dashboard/owner/messages",
    requireDashboardAuth,
    requireOwner,
    requireCsrf,
    rateLimit("dashboard-owner-message", 10, 60 * 1_000),
    asyncHandler(async (req, res) => {
      const parsed = ownerMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        safeJsonError(res, 400, formatZodError(parsed.error));
        return;
      }

      const guild = client.guilds.cache.get(parsed.data.guildId);
      const channel = guild?.channels.cache.get(parsed.data.channelId);
      const botMember = guild?.members.me;
      if (
        !guild ||
        !channel ||
        !botMember ||
        (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) ||
        channel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]) !== true
      ) {
        safeJsonError(res, 403, "bot7108 cannot send messages to that channel.");
        return;
      }

      const message = await channel.send({
        content: parsed.data.content,
        allowedMentions: { parse: [], repliedUser: false }
      });

      await recordDashboardAuditEvent({
        guildId: guild.id,
        actorUserId: req.dashboard!.user.id,
        actorDisplayName: req.dashboard!.user.displayName,
        action: "owner.message.send",
        targetType: "channel",
        targetId: channel.id,
        newValue: { contentLength: parsed.data.content.length },
        metadata: { messageId: message.id }
      });

      logger.info({ guildId: guild.id, channelId: channel.id, messageId: message.id }, "Owner sent a bot message");
      res.status(201).json({ ok: true, message: "Message sent.", messageId: message.id });
    })
  );

  app.patch(
    "/api/dashboard/owner/presence",
    requireDashboardAuth,
    requireOwner,
    requireCsrf,
    rateLimit("dashboard-owner-presence", 30, 60 * 60 * 1_000),
    asyncHandler(async (req, res) => {
      const parsed = ownerPresenceSchema.safeParse(req.body);
      if (!parsed.success) {
        safeJsonError(res, 400, formatZodError(parsed.error));
        return;
      }
      if (!client.user || !client.isReady()) {
        safeJsonError(res, 503, "bot7108 is not ready.");
        return;
      }

      const previous = await getBotControlSettings();
      const updated = await saveBotControlSettings({
        ...parsed.data,
        updatedById: req.dashboard!.user.id
      });
      applyBotPresence(client, updated);

      await recordDashboardAuditEvent({
        guildId: "global",
        actorUserId: req.dashboard!.user.id,
        actorDisplayName: req.dashboard!.user.displayName,
        action: "owner.presence.update",
        targetType: "bot_presence",
        targetId: client.user.id,
        previousValue: previous,
        newValue: updated
      });

      res.json({ ok: true, message: "Bot presence updated.", presence: updated });
    })
  );

  app.patch(
    "/api/dashboard/owner/profile",
    requireDashboardAuth,
    requireOwner,
    requireCsrf,
    rateLimit("dashboard-owner-profile", 2, 60 * 60 * 1_000),
    asyncHandler(async (req, res) => {
      const parsed = ownerProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        safeJsonError(res, 400, formatZodError(parsed.error));
        return;
      }

      const botUser = client.user;
      if (!botUser || !client.isReady()) {
        safeJsonError(res, 503, "bot7108 is not ready.");
        return;
      }

      const previousUsername = botUser.username;
      if (parsed.data.username !== previousUsername) {
        try {
          await botUser.setUsername(parsed.data.username);
        } catch (error) {
          logger.warn({ err: error }, "Discord rejected owner bot username update");
          safeJsonError(res, 429, "Discord rejected the username update. Try again later.");
          return;
        }
      }

      await recordDashboardAuditEvent({
        guildId: "global",
        actorUserId: req.dashboard!.user.id,
        actorDisplayName: req.dashboard!.user.displayName,
        action: "owner.profile.username",
        targetType: "bot_profile",
        targetId: botUser.id,
        previousValue: { username: previousUsername },
        newValue: { username: botUser.username }
      });

      res.json({ ok: true, message: "Bot username updated.", username: botUser.username });
    })
  );

  app.post(
    "/api/dashboard/owner/avatar",
    requireDashboardAuth,
    requireOwner,
    requireCsrf,
    rateLimit("dashboard-owner-avatar", 2, 60 * 60 * 1_000),
    (req, res, next) => {
      ownerAvatarUpload.single("avatar")(req, res, (uploadError) => {
        if (uploadError) {
          safeJsonError(res, 400, uploadError instanceof multer.MulterError ? "Avatar must be a supported image under 2 MB." : "Invalid avatar upload.");
          return;
        }

        void (async () => {
          const botUser = client.user;
          if (!botUser || !client.isReady()) {
            safeJsonError(res, 503, "bot7108 is not ready.");
            return;
          }
          if (!req.file || !isSupportedAvatar(req.file.buffer)) {
            safeJsonError(res, 400, "Avatar must be a valid PNG, JPEG, GIF, or WebP image.");
            return;
          }

          try {
            await botUser.setAvatar(req.file.buffer);
          } catch (error) {
            logger.warn({ err: error }, "Discord rejected owner bot avatar update");
            safeJsonError(res, 429, "Discord rejected the avatar update. Try again later.");
            return;
          }

          await recordDashboardAuditEvent({
            guildId: "global",
            actorUserId: req.dashboard!.user.id,
            actorDisplayName: req.dashboard!.user.displayName,
            action: "owner.profile.avatar",
            targetType: "bot_profile",
            targetId: botUser.id,
            newValue: { changed: true }
          });

          res.json({
            ok: true,
            message: "Bot avatar updated.",
            avatarUrl: botUser.displayAvatarURL({ extension: "png", size: 256 })
          });
        })().catch(next);
      });
    }
  );

  app.get(
    "/api/dashboard/guilds/:guildId/summary",
    requireDashboardAuth,
    rateLimit("dashboard-summary", 120, 60 * 1_000),
    asyncHandler(async (req, res) => {
      const context = await guildDashboardContext(client, req, res);
      if (!context) {
        return;
      }

      const settings = await getGuildSettings(context.guild.id);
      const recentCases = await ModerationCaseModel.find({ guildId: context.guild.id }).sort({ createdAt: -1 }).limit(6).lean();
      const recentAudit = await DashboardAuditEventModel.find({ guildId: context.guild.id }).sort({ createdAt: -1 }).limit(6).lean();

      res.json({
        ok: true,
        guild: {
          id: context.guild.id,
          name: context.guild.name,
          iconUrl: serializeGuildIcon(context.guild),
          memberCount: context.guild.memberCount,
          botInstalled: true,
          botOnline: client.isReady()
        },
        stats: {
          commands: client.commands.size,
          moderationCases: await ModerationCaseModel.countDocuments({ guildId: context.guild.id }),
          enabledModules: MODULE_NAMES.filter((name) => settings.modules[name])
        },
        checklist: [
          { label: "Set moderation log channel", done: Boolean(settings.modLogChannelId ?? settings.logging.moderation.channelId) },
          { label: "Review automod filters", done: settings.automod.enabled },
          { label: "Configure welcome channel", done: settings.welcome.enabled && Boolean(settings.welcome.channelId) },
          { label: "Set ticket staff roles", done: settings.staffRoleIds.length > 0 || settings.rolePolicy.moderatorRoleIds.length > 0 }
        ],
        recentCases,
        recentAudit
      });
    })
  );

  app.get(
    "/api/dashboard/guilds/:guildId/settings",
    requireDashboardAuth,
    rateLimit("dashboard-settings-read", 120, 60 * 1_000),
    asyncHandler(async (req, res) => {
      const context = await guildDashboardContext(client, req, res);
      if (!context) {
        return;
      }

      const settings = await getGuildSettings(context.guild.id);
      res.json({
        ok: true,
        settings,
        channels: serializeChannels(context.guild),
        roles: serializeRoles(context.guild, context.botMember.roles.highest.position)
      });
    })
  );

  app.patch(
    "/api/dashboard/guilds/:guildId/settings",
    requireDashboardAuth,
    requireCsrf,
    rateLimit("dashboard-settings-write", 40, 60 * 1_000),
    asyncHandler(async (req, res) => {
      const context = await guildDashboardContext(client, req, res);
      if (!context || !req.dashboard) {
        return;
      }

      const current = await getGuildSettings(context.guild.id);
      let patch: Partial<GuildSettingsShape>;
      try {
        patch = buildSettingsPatch(current, req.body);
      } catch (error) {
        safeJsonError(res, 400, error instanceof Error ? error.message : "Invalid settings payload.");
        return;
      }

      if (patch.welcome?.roleId && !canAssignRole(context.botMember, patch.welcome.roleId)) {
        safeJsonError(res, 400, "bot7108 cannot assign the selected welcome role due to role hierarchy.");
        return;
      }

      const updated = await updateGuildSettings(context.guild.id, patch);
      await recordDashboardAuditEvent({
        guildId: context.guild.id,
        actorUserId: req.dashboard.user.id,
        actorDisplayName: req.dashboard.user.displayName,
        action: "settings.update",
        targetType: "guild_settings",
        targetId: context.guild.id,
        previousValue: current,
        newValue: patch
      });

      await createDashboardSettingsLog({
        guild: context.guild,
        settings: updated ?? current,
        actor: req.dashboard.user,
        action: "settings.update",
        target: context.guild.id
      });

      res.json({ ok: true, message: "Settings saved.", settings: updated });
    })
  );

  app.get(
    "/api/dashboard/guilds/:guildId/commands",
    requireDashboardAuth,
    rateLimit("dashboard-commands-read", 120, 60 * 1_000),
    asyncHandler(async (req, res) => {
      const context = await guildDashboardContext(client, req, res);
      if (!context) {
        return;
      }

      const overrides = new Map((await getCommandOverrides(context.guild.id)).map((override) => [override.commandName, override]));
      const commands = [...client.commands.values()].map((command) => serializeCommand(command, overrides.get(command.data.name) ?? null));
      res.json({ ok: true, commands });
    })
  );

  app.patch(
    "/api/dashboard/guilds/:guildId/commands/:commandName",
    requireDashboardAuth,
    requireCsrf,
    rateLimit("dashboard-commands-write", 60, 60 * 1_000),
    asyncHandler(async (req, res) => {
      const context = await guildDashboardContext(client, req, res);
      if (!context || !req.dashboard) {
        return;
      }

      const command = client.commands.get(req.params.commandName);
      if (!command) {
        safeJsonError(res, 404, "Command not found.");
        return;
      }

      const parsed = commandOverrideSchema.safeParse(req.body);
      if (!parsed.success) {
        safeJsonError(res, 400, formatZodError(parsed.error));
        return;
      }

      const previous = await getCommandOverride(context.guild.id, command.data.name);
      const updated = await upsertCommandOverride(context.guild.id, command.data.name, {
        ...parsed.data,
        updatedById: req.dashboard.user.id
      }).catch((error) => {
        throw new Error(error instanceof Error ? error.message : "Failed to save command settings.");
      });

      await recordDashboardAuditEvent({
        guildId: context.guild.id,
        actorUserId: req.dashboard.user.id,
        actorDisplayName: req.dashboard.user.displayName,
        action: "command_settings.update",
        targetType: "command",
        targetId: command.data.name,
        previousValue: previous,
        newValue: updated
      });

      const settings = await getGuildSettings(context.guild.id);
      await createDashboardSettingsLog({
        guild: context.guild,
        settings,
        actor: req.dashboard.user,
        action: "command_settings.update",
        target: command.data.name
      });

      res.json({ ok: true, command: serializeCommand(command, updated), message: "Command settings saved." });
    })
  );

  app.post(
    "/api/dashboard/guilds/:guildId/moderation/actions",
    requireDashboardAuth,
    requireCsrf,
    rateLimit("dashboard-moderation-action", 20, 60 * 1_000),
    asyncHandler(async (req, res) => {
      await handleModerationAction(client, req, res);
    })
  );

  app.get(
    "/api/dashboard/guilds/:guildId/audit",
    requireDashboardAuth,
    rateLimit("dashboard-audit-read", 120, 60 * 1_000),
    asyncHandler(async (req, res) => {
      const context = await guildDashboardContext(client, req, res);
      if (!context) {
        return;
      }

      const events = await DashboardAuditEventModel.find({ guildId: context.guild.id }).sort({ createdAt: -1 }).limit(100).lean();
      res.json({ ok: true, events });
    })
  );

  app.get(
    "/api/dashboard/guilds/:guildId/moderation/cases",
    requireDashboardAuth,
    rateLimit("dashboard-cases-read", 120, 60 * 1_000),
    asyncHandler(async (req, res) => {
      const context = await guildDashboardContext(client, req, res);
      if (!context) {
        return;
      }

      const cases = await ModerationCaseModel.find({ guildId: context.guild.id }).sort({ createdAt: -1 }).limit(100).lean();
      res.json({ ok: true, cases });
    })
  );

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err: error }, "Dashboard route failed");
    if (res.headersSent) {
      return;
    }
    res.status(500).json({ ok: false, error: "An unexpected dashboard error occurred." });
  });
}
