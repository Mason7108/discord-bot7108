import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { Env } from "../config/env.js";
import { DashboardSessionModel, type DashboardSessionDocument } from "../models/DashboardSession.js";

export const DASHBOARD_SESSION_COOKIE = "bot7108_dashboard_session";
const DASHBOARD_OAUTH_STATE_COOKIE = "bot7108_dashboard_oauth_state";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1_000;

export interface DashboardUser {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
}

export interface DashboardSessionContext {
  user: DashboardUser;
  session: DashboardSessionDocument;
  accessToken: string;
  csrfToken: string;
}

export interface DiscordTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

export interface DiscordUserResponse {
  id?: string;
  username?: string;
  global_name?: string | null;
  avatar?: string | null;
}

export interface OAuthStatePayload {
  state: string;
  returnTo: string;
  expiresAt: number;
}

declare global {
  namespace Express {
    interface Request {
      dashboard?: DashboardSessionContext;
    }
  }
}

export function isDiscordId(value: unknown): value is string {
  return typeof value === "string" && /^\d{15,25}$/.test(value);
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) {
    return result;
  }

  for (const chunk of header.split(";")) {
    const separator = chunk.indexOf("=");
    if (separator < 0) {
      continue;
    }

    const key = chunk.slice(0, separator).trim();
    const value = chunk.slice(separator + 1).trim();
    if (key) {
      result[key] = decodeURIComponent(value);
    }
  }

  return result;
}

export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  if (value.startsWith("/auth/") || value.startsWith("/api/")) {
    return "/dashboard";
  }

  return value.slice(0, 300);
}

export function getDashboardSecret(env: Env): string | undefined {
  return env.SESSION_SECRET ?? env.AGREEMENT_COOKIE_SECRET;
}

export function getOAuthClientSecret(env: Env): string | undefined {
  return env.DISCORD_CLIENT_SECRET ?? env.DISCORD_OAUTH_CLIENT_SECRET;
}

export function isSecureCookie(env: Env): boolean {
  return env.NODE_ENV === "production" || env.BASE_URL?.startsWith("https://") === true;
}

export function cookieOptions(env: Env, maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: isSecureCookie(env),
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeMs
  };
}

export function clearDashboardCookies(res: Response, env: Env): void {
  res.clearCookie(DASHBOARD_SESSION_COOKIE, cookieOptions(env, 0));
  res.clearCookie(DASHBOARD_OAUTH_STATE_COOKIE, cookieOptions(env, 0));
}

export function hashDashboardValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

function encryptionKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptToken(secret: string, token: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptToken(secret: string, encryptedToken: string): string | null {
  const [ivRaw, tagRaw, encryptedRaw] = encryptedToken.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    return null;
  }

  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(secret), Buffer.from(ivRaw, "base64url"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

function signPayload(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function encodeSignedPayload(secret: string, payload: OAuthStatePayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signPayload(secret, encoded)}`;
}

function decodeSignedPayload(secret: string, value: string | undefined): OAuthStatePayload | null {
  if (!value) {
    return null;
  }

  const separator = value.lastIndexOf(".");
  if (separator < 0) {
    return null;
  }

  const encoded = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const expected = signPayload(secret, encoded);

  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expected, "utf8"))
  ) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OAuthStatePayload;
  } catch {
    return null;
  }
}

export function buildDashboardRedirectUri(env: Env, req: Request): string {
  if (env.DISCORD_REDIRECT_URI) {
    return env.DISCORD_REDIRECT_URI;
  }

  const baseUrl = env.BASE_URL ?? `${req.protocol}://${req.get("host")}`;
  return new URL("/auth/dashboard/discord/callback", baseUrl).toString();
}

export function buildBotInviteUrl(env: Env, guildId?: string): string {
  const permissions = env.BOT_INVITE_PERMISSIONS ?? "1374695058518";
  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("client_id", env.CLIENT_ID);
  url.searchParams.set("scope", "bot applications.commands");
  url.searchParams.set("permissions", permissions);
  if (guildId) {
    url.searchParams.set("guild_id", guildId);
    url.searchParams.set("disable_guild_select", "true");
  }
  return url.toString();
}

export function createOAuthStateCookie(env: Env, res: Response, state: OAuthStatePayload): void {
  const secret = getDashboardSecret(env);
  if (!secret) {
    throw new Error("SESSION_SECRET is required for dashboard OAuth.");
  }

  res.cookie(DASHBOARD_OAUTH_STATE_COOKIE, encodeSignedPayload(secret, state), cookieOptions(env, OAUTH_STATE_TTL_MS));
}

export function consumeOAuthStateCookie(env: Env, req: Request, res: Response): OAuthStatePayload | null {
  const secret = getDashboardSecret(env);
  if (!secret) {
    return null;
  }

  const cookies = parseCookies(req.headers.cookie);
  const decoded = decodeSignedPayload(secret, cookies[DASHBOARD_OAUTH_STATE_COOKIE]);
  res.clearCookie(DASHBOARD_OAUTH_STATE_COOKIE, cookieOptions(env, 0));
  if (!decoded || decoded.expiresAt <= Date.now()) {
    return null;
  }

  return decoded;
}

export async function createDashboardSession(input: {
  env: Env;
  res: Response;
  token: DiscordTokenResponse;
  user: DiscordUserResponse;
}): Promise<DashboardSessionContext> {
  const secret = getDashboardSecret(input.env);
  if (!secret || !input.token.access_token || !isDiscordId(input.user.id) || !input.user.username) {
    throw new Error("Dashboard session could not be created.");
  }

  const sessionId = crypto.randomBytes(32).toString("base64url");
  const csrfToken = crypto.randomBytes(32).toString("base64url");
  const expiresMs = Math.min(SESSION_TTL_MS, Math.max(60_000, (input.token.expires_in ?? 3600) * 1_000));
  const expiresAt = new Date(Date.now() + expiresMs);
  const displayName = input.user.global_name ?? input.user.username;

  const session = await DashboardSessionModel.create({
    sessionIdHash: hashDashboardValue(sessionId),
    discordUserId: input.user.id,
    username: input.user.username,
    displayName,
    avatar: input.user.avatar ?? undefined,
    encryptedAccessToken: encryptToken(secret, input.token.access_token),
    tokenExpiresAt: expiresAt,
    csrfToken,
    csrfTokenHash: hashDashboardValue(csrfToken),
    expiresAt
  });

  input.res.cookie(DASHBOARD_SESSION_COOKIE, sessionId, cookieOptions(input.env, expiresMs));

  return {
    user: {
      id: input.user.id,
      username: input.user.username,
      displayName,
      avatar: input.user.avatar ?? undefined
    },
    session,
    accessToken: input.token.access_token,
    csrfToken
  };
}

export async function getDashboardSession(req: Request, env: Env): Promise<DashboardSessionContext | null> {
  const secret = getDashboardSecret(env);
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies[DASHBOARD_SESSION_COOKIE];
  if (!secret || !sessionId) {
    return null;
  }

  const session = await DashboardSessionModel.findOne({ sessionIdHash: hashDashboardValue(sessionId) });
  if (!session || session.expiresAt.getTime() <= Date.now() || session.tokenExpiresAt.getTime() <= Date.now()) {
    if (session) {
      await DashboardSessionModel.deleteOne({ _id: session._id }).catch(() => null);
    }
    return null;
  }

  const accessToken = decryptToken(secret, session.encryptedAccessToken);
  if (!accessToken) {
    await DashboardSessionModel.deleteOne({ _id: session._id }).catch(() => null);
    return null;
  }

  return {
    user: {
      id: session.discordUserId,
      username: session.username,
      displayName: session.displayName ?? session.username,
      avatar: session.avatar
    },
    session,
    accessToken,
    csrfToken: session.csrfToken
  };
}

export async function attachDashboardSession(env: Env, req: Request, _res: Response, next: NextFunction): Promise<void> {
  req.dashboard = (await getDashboardSession(req, env)) ?? undefined;
  next();
}

export function requireDashboardAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.dashboard) {
    res.status(401).json({ ok: false, error: "Authentication required." });
    return;
  }

  next();
}

export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  const sent = req.get("x-csrf-token");
  const expected = req.dashboard?.session.csrfTokenHash;
  if (!sent || !expected || hashDashboardValue(sent) !== expected) {
    res.status(403).json({ ok: false, error: "CSRF token is missing or invalid." });
    return;
  }

  next();
}

export async function destroyDashboardSession(req: Request, res: Response, env: Env): Promise<void> {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies[DASHBOARD_SESSION_COOKIE];
  if (sessionId) {
    await DashboardSessionModel.deleteOne({ sessionIdHash: hashDashboardValue(sessionId) }).catch(() => null);
  }

  clearDashboardCookies(res, env);
}

export function serializeDashboardUser(user: DashboardUser) {
  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
    : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(user.id) % 5n)}.png`;

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl
  };
}
