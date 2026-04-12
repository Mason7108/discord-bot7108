import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  CLIENT_ID: z.string().min(1, "CLIENT_ID is required"),
  MONGO_URI: z.string().min(1, "MONGO_URI is required"),
  DEV_GUILD_ID: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  API_PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DEFAULT_CURRENCY: z.string().default("coins"),
  AI_API_KEY: z.string().optional(),
  VERIFIED_ROLE_ID: z.string().optional(),
  VERIFIED_ROLE_NAME: z.string().default("Verified"),
  MEMBER_ROLE_ID: z.string().optional(),
  MEMBER_ROLE_NAME: z.string().default("Member")
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  return envSchema.parse(process.env);
}
