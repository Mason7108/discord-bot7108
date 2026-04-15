import { config } from "dotenv";
import { z } from "zod";

config();

const rawEnvSchema = z.object({
  BOT_TOKEN: z.string().optional(),
  DISCORD_TOKEN: z.string().optional(),
  CLIENT_ID: z.string().min(1, "CLIENT_ID is required"),
  GUILD_ID: z.string().optional(),
  MONGO_URI: z.string().min(1, "MONGO_URI is required"),
  DEV_GUILD_ID: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  API_PORT: z.coerce.number().optional(),
  PORT: z.coerce.number().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DEFAULT_CURRENCY: z.string().default("coins"),
  AI_API_KEY: z.string().optional(),
  VERIFY_CHANNEL_ID: z.string().optional(),
  LOG_CHANNEL_ID: z.string().optional(),
  BASE_URL: z.string().url("BASE_URL must be a valid URL").optional(),
  HCAPTCHA_SECRET: z.string().optional(),
  HCAPTCHA_SITEKEY: z.string().optional(),
  VERIFIED_ROLE_ID: z.string().optional(),
  VERIFIED_ROLE_NAME: z.string().default("Verified"),
  UNVERIFIED_ROLE_ID: z.string().optional(),
  UNVERIFIED_ROLE_NAME: z.string().default("Unverified"),
  MEMBER_ROLE_ID: z.string().optional(),
  MEMBER_ROLE_NAME: z.string().default("Member"),
  VERIFY_TOKEN_TTL_SEC: z.coerce.number().min(300).max(900).default(600),
  VERIFY_BUTTON_COOLDOWN_SEC: z.coerce.number().min(3).max(120).default(15)
});

export interface Env extends z.infer<typeof rawEnvSchema> {
  BOT_TOKEN: string;
  API_PORT: number;
}

export function loadEnv(): Env {
  const parsed = rawEnvSchema.parse(process.env);
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
