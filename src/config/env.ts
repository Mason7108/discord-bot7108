import { config } from "dotenv";
import { z } from "zod";

config();

const optionalPortSchema = z.preprocess((value) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const num = Number(value);
  if (!Number.isFinite(num)) {
    return undefined;
  }

  return num;
}, z.number().int().positive().optional());

const optionalNumberWithDefault = (defaultValue: number, min: number, max: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === null) {
      return undefined;
    }

    const num = Number(value);
    if (!Number.isFinite(num)) {
      return undefined;
    }

    return num;
  }, z.number().min(min).max(max).default(defaultValue));

const rawEnvSchema = z.object({
  BOT_TOKEN: z.string().optional(),
  DISCORD_TOKEN: z.string().optional(),
  CLIENT_ID: z.string().min(1, "CLIENT_ID is required"),
  DISCORD_OAUTH_CLIENT_SECRET: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  DISCORD_REDIRECT_URI: z.string().url("DISCORD_REDIRECT_URI must be a valid URL").optional(),
  GUILD_ID: z.string().optional(),
  MONGO_URI: z.string().min(1, "MONGO_URI is required"),
  DEV_GUILD_ID: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  API_PORT: optionalPortSchema,
  PORT: optionalPortSchema,
  FRONTEND_ORIGIN: z.string().url("FRONTEND_ORIGIN must be a valid URL").optional(),
  PUBLIC_ACTIVITY_URL: z.string().url("PUBLIC_ACTIVITY_URL must be a valid URL").optional(),
  BACKEND_PUBLIC_URL: z.string().url("BACKEND_PUBLIC_URL must be a valid URL").optional(),
  ACTIVITY_SESSION_SECRET: z.string().min(32, "ACTIVITY_SESSION_SECRET must be at least 32 characters").optional(),
  ACTIVITY_ALLOWED_ORIGINS: z.string().optional(),
  ACTIVITY_SESSION_TTL_MIN: optionalNumberWithDefault(240, 15, 1440),
  YOUTUBE_API_KEY: z.string().optional(),
  SPOTIFY_CLIENT_ID: z.string().optional(),
  SPOTIFY_CLIENT_SECRET: z.string().optional(),
  UPLOAD_MAX_MB: optionalNumberWithDefault(25, 1, 100),
  UPLOAD_DIRECTORY: z.string().default("data/activity-uploads"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DEFAULT_CURRENCY: z.string().default("coins"),
  AI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  VOICE_COMMANDS_OPENAI_API_KEY: z.string().optional(),
  VOICE_COMMANDS_STT_MODEL: z.string().default("whisper-1"),
  VOICE_COMMANDS_COOLDOWN_SEC: optionalNumberWithDefault(5, 1, 60),
  VOICE_COMMANDS_TRANSCRIPTION_COOLDOWN_SEC: optionalNumberWithDefault(2, 1, 30),
  VOICE_COMMANDS_MAX_AUDIO_SEC: optionalNumberWithDefault(10, 2, 20),
  VOICE_COMMANDS_SILENCE_MS: optionalNumberWithDefault(1200, 500, 3000),
  VOICE_COMMANDS_TRANSCRIBE_TIMEOUT_MS: optionalNumberWithDefault(15000, 5000, 45000),
  VC_TTS_ENGINE_PATH: z.string().default("espeak-ng"),
  VC_TTS_VOICE: z.string().default("en-us"),
  VC_TTS_SPEED: optionalNumberWithDefault(165, 80, 260),
  VC_TTS_PITCH: optionalNumberWithDefault(50, 0, 99),
  VC_TTS_MAX_CHARS: optionalNumberWithDefault(220, 1, 500),
  VC_TTS_QUEUE_LIMIT: optionalNumberWithDefault(5, 1, 20),
  YOUTUBE_COOKIES: z.string().optional(),
  YOUTUBE_COOKIES_JSON: z.string().optional(),
  YOUTUBE_COOKIES_BASE64: z.string().optional(),
  YTDLP_PROXY: z.string().optional(),
  YOUTUBE_PROXY: z.string().optional(),
  YTDLP_TIMEOUT_MS: optionalNumberWithDefault(15000, 5000, 45000),
  YTDLP_SEARCH_LIMIT: optionalNumberWithDefault(5, 1, 10),
  YTDLP_MAX_CANDIDATES: optionalNumberWithDefault(3, 1, 10),
  YTDLP_EXTRACTOR_ARGS: z.string().optional(),
  YTDLP_USER_AGENT: z.string().optional(),
  FFMPEG_USER_AGENT: z.string().optional(),
  FFMPEG_REFERER: z.string().optional(),
  FFMPEG_PROXY: z.string().optional(),
  BOT_OWNER_ID: z.string().optional(),
  MAIN_GUILD_ID: z.string().optional(),
  APPEAL_GUILD_ID: z.string().default("1490191877960503457"),
  APPEAL_REVIEW_CHANNEL_ID: z.string().optional(),
  BANNED_USER_ROLE_ID: z.string().optional(),
  APPEAL_SERVER_INVITE: z.string().optional(),
  VERIFY_CHANNEL_ID: z.string().optional(),
  WELCOME_CHANNEL_ID: z.string().optional(),
  MESSAGE_LOG_CHANNEL_ID: z.string().optional(),
  INVITE_GENERATOR_CHANNEL_ID: z.string().optional(),
  INVITE_LOG_CHANNEL_ID: z.string().optional(),
  LOG_CHANNEL_ID: z.string().optional(),
  AGREEMENT_CHANNEL_ID: z.string().default("1511227468873465856"),
  AGREEMENT_LOG_CHANNEL_ID: z.string().default("1511432273797451796"),
  AGREEMENT_COOKIE_SECRET: z.string().optional(),
  BASE_URL: z.string().url("BASE_URL must be a valid URL").optional(),
  RECAPTCHA_SITE_KEY: z.string().optional(),
  RECAPTCHA_SECRET_KEY: z.string().optional(),
  HCAPTCHA_SECRET: z.string().optional(),
  HCAPTCHA_SITEKEY: z.string().optional(),
  VERIFIED_ROLE_ID: z.string().optional(),
  VERIFIED_ROLE_NAME: z.string().default("Verified"),
  UNVERIFIED_ROLE_ID: z.string().optional(),
  UNVERIFIED_ROLE_NAME: z.string().default("Unverified"),
  MEMBER_ROLE_ID: z.string().optional(),
  MEMBER_ROLE_NAME: z.string().default("Member"),
  VERIFY_TOKEN_TTL_SEC: optionalNumberWithDefault(600, 300, 900),
  VERIFY_BUTTON_COOLDOWN_SEC: optionalNumberWithDefault(15, 3, 120)
});

export interface Env extends z.infer<typeof rawEnvSchema> {
  BOT_TOKEN: string;
  API_PORT: number;
}

function normalizeProcessEnv(input: NodeJS.ProcessEnv): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    normalized[key] = trimmed.length === 0 ? undefined : trimmed;
  }

  return normalized;
}

export function loadEnv(): Env {
  const parsed = rawEnvSchema.parse(normalizeProcessEnv(process.env));
  const botToken = parsed.BOT_TOKEN ?? parsed.DISCORD_TOKEN;

  if (!botToken || botToken.trim().length === 0) {
    throw new z.ZodError([
      {
        code: "invalid_type",
        expected: "string",
        received: "undefined",
        path: ["BOT_TOKEN"],
        message: "BOT_TOKEN is required (or set DISCORD_TOKEN)"
      }
    ]);
  }

  return {
    ...parsed,
    BOT_TOKEN: botToken,
    API_PORT: parsed.API_PORT ?? parsed.PORT ?? 3000
  };
}
