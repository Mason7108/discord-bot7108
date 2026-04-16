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
  GUILD_ID: z.string().optional(),
  MONGO_URI: z.string().min(1, "MONGO_URI is required"),
  DEV_GUILD_ID: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  API_PORT: optionalPortSchema,
  PORT: optionalPortSchema,
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DEFAULT_CURRENCY: z.string().default("coins"),
  AI_API_KEY: z.string().optional(),
  VERIFY_CHANNEL_ID: z.string().optional(),
  LOG_CHANNEL_ID: z.string().optional(),
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
