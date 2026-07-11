import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import type { BotClient } from "../../core/types.js";
import type { ActivityAuthResult, ActivityIdentity, ActivityMediaItem } from "./types.js";

const discordAuthSchema = z.object({
  code: z.string().min(1).max(2048),
  guildId: z.string().regex(/^\d{17,20}$/),
  channelId: z.string().regex(/^\d{17,20}$/),
  instanceId: z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/)
});

const devAuthSchema = z.object({
  scope: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).default("preview"),
  userId: z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/),
  username: z.string().trim().min(1).max(40)
});

const tokenPayloadSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  avatarUrl: z.string().url().optional(),
  roomId: z.string().min(1),
  guildId: z.string().optional(),
  channelId: z.string().optional(),
  instanceId: z.string().optional(),
  expiresAt: z.number().int().positive(),
  development: z.boolean().optional()
});

type DiscordTokenResponse = { access_token?: string; token_type?: string; expires_in?: number };
type DiscordUserResponse = { id?: string; username?: string; global_name?: string | null; avatar?: string | null };

declare global {
  namespace Express {
    interface Request {
      activityIdentity?: ActivityIdentity;
    }
  }
}

export class ActivityAuthError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "ActivityAuthError";
  }
}

export class ActivityAuthenticator {
  private readonly signingSecret: Buffer;

  constructor(private readonly env: Env, private readonly client: BotClient) {
    const configured = env.ACTIVITY_SESSION_SECRET ?? env.DISCORD_CLIENT_SECRET ?? env.DISCORD_OAUTH_CLIENT_SECRET;
    this.signingSecret = configured ? Buffer.from(configured, "utf8") : randomBytes(48);
  }

  async authenticateDiscord(input: unknown): Promise<ActivityAuthResult> {
    const body = discordAuthSchema.parse(input);
    const clientSecret = this.env.DISCORD_CLIENT_SECRET ?? this.env.DISCORD_OAUTH_CLIENT_SECRET;
    if (!clientSecret) {
      throw new ActivityAuthError(503, "DISCORD_AUTH_NOT_CONFIGURED", "Discord Activity authentication is not configured.");
    }

    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.env.CLIENT_ID,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code: body.code,
        ...(this.env.DISCORD_REDIRECT_URI ? { redirect_uri: this.env.DISCORD_REDIRECT_URI } : {})
      })
    });
    const token = (await tokenResponse.json()) as DiscordTokenResponse;
    if (!tokenResponse.ok || !token.access_token) {
      throw new ActivityAuthError(401, "DISCORD_CODE_REJECTED", "Discord rejected the Activity authorization code.");
    }

    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${token.access_token}` }
    });
    const discordUser = (await userResponse.json()) as DiscordUserResponse;
    if (!userResponse.ok || !discordUser.id || !discordUser.username) {
      throw new ActivityAuthError(401, "DISCORD_USER_UNAVAILABLE", "Discord user authentication failed.");
    }

    const guild = this.client.guilds.cache.get(body.guildId);
    const channel = guild?.channels.cache.get(body.channelId);
    if (!guild || !channel?.isVoiceBased()) {
      throw new ActivityAuthError(403, "ACTIVITY_CHANNEL_INVALID", "The Activity channel is not available to bot7108.");
    }
    const member = await guild.members.fetch(discordUser.id).catch(() => null);
    if (!member || member.voice.channelId !== body.channelId) {
      throw new ActivityAuthError(403, "VOICE_MEMBERSHIP_REQUIRED", "Join the Activity voice channel before opening bot7108 Activity.");
    }

    const identity: ActivityIdentity = {
      id: discordUser.id,
      username: discordUser.global_name || discordUser.username,
      avatarUrl: discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.webp?size=128`
        : undefined,
      roomId: `guild:${guild.id}:voice:${channel.id}`,
      guildId: guild.id,
      channelId: channel.id,
      instanceId: body.instanceId,
      expiresAt: Date.now() + this.env.ACTIVITY_SESSION_TTL_MIN * 60_000
    };

    return {
      sessionToken: this.sign(identity),
      discordAccessToken: token.access_token,
      identity
    };
  }

  authenticateDevelopment(input: unknown): ActivityAuthResult {
    if (this.env.NODE_ENV === "production") {
      throw new ActivityAuthError(404, "NOT_FOUND", "Not found.");
    }
    const body = devAuthSchema.parse(input);
    const identity: ActivityIdentity = {
      id: `dev:${body.userId}`,
      username: body.username,
      roomId: `dev:${body.scope}`,
      instanceId: body.scope,
      expiresAt: Date.now() + this.env.ACTIVITY_SESSION_TTL_MIN * 60_000,
      development: true
    };
    return { sessionToken: this.sign(identity), identity };
  }

  verify(token: string): ActivityIdentity {
    const [encoded, signature] = token.split(".");
    if (!encoded || !signature) {
      throw new ActivityAuthError(401, "SESSION_TOKEN_INVALID", "Activity session token is invalid.");
    }
    const expected = this.signature(encoded);
    const actualBuffer = Buffer.from(signature, "base64url");
    const expectedBuffer = Buffer.from(expected, "base64url");
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
      throw new ActivityAuthError(401, "SESSION_TOKEN_INVALID", "Activity session token is invalid.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    } catch {
      throw new ActivityAuthError(401, "SESSION_TOKEN_INVALID", "Activity session token is invalid.");
    }
    const identity = tokenPayloadSchema.parse(parsed);
    if (identity.expiresAt <= Date.now()) {
      throw new ActivityAuthError(401, "SESSION_TOKEN_EXPIRED", "Activity session expired. Reopen the Activity.");
    }
    return identity;
  }

  signMedia(item: ActivityMediaItem, identity: ActivityIdentity): ActivityMediaItem {
    return { ...item, proof: this.signature(this.mediaPayload(item, identity.roomId)) };
  }

  verifyMedia(item: ActivityMediaItem, identity: ActivityIdentity): ActivityMediaItem {
    if (!item.proof) {
      throw new ActivityAuthError(403, "MEDIA_PROOF_REQUIRED", "Add media returned by the bot7108 Activity server.");
    }
    const expected = Buffer.from(this.signature(this.mediaPayload(item, identity.roomId)), "base64url");
    const actual = Buffer.from(item.proof, "base64url");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new ActivityAuthError(403, "MEDIA_PROOF_INVALID", "Media details were changed after server validation.");
    }
    return item;
  }

  requestMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) {
      res.status(401).json({ ok: false, error: { code: "AUTH_REQUIRED", message: "Activity authentication is required." } });
      return;
    }
    try {
      req.activityIdentity = this.verify(token);
      next();
    } catch (error) {
      const authError = error instanceof ActivityAuthError ? error : new ActivityAuthError(401, "AUTH_FAILED", "Activity authentication failed.");
      res.status(authError.status).json({ ok: false, error: { code: authError.code, message: authError.message } });
    }
  };

  private sign(identity: ActivityIdentity): string {
    const encoded = Buffer.from(JSON.stringify(identity), "utf8").toString("base64url");
    return `${encoded}.${this.signature(encoded)}`;
  }

  private signature(encoded: string): string {
    return createHmac("sha256", this.signingSecret).update(encoded).digest("base64url");
  }

  private mediaPayload(item: ActivityMediaItem, roomId: string): string {
    return JSON.stringify({
      roomId,
      id: item.id,
      source: item.source,
      sourceId: item.sourceId,
      playbackKind: item.playbackKind,
      title: item.title,
      creator: item.creator,
      collection: item.collection,
      thumbnailUrl: item.thumbnailUrl,
      durationSeconds: item.durationSeconds,
      url: item.url,
      embeddable: item.embeddable,
      metadataOnly: item.metadataOnly,
      uploadedByUserId: item.uploadedByUserId
    });
  }
}
