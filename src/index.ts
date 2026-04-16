import { Collection, GatewayIntentBits, Partials } from "discord.js";
import { Client } from "discord.js";
import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { startApiServer } from "./api/server.js";
import { loadEnv } from "./config/env.js";
import { loadCommands } from "./core/loaders/commandLoader.js";
import { loadEvents } from "./core/loaders/eventLoader.js";
import { registerSlashCommands } from "./core/loaders/slashRegistrar.js";
import { createDisTube } from "./core/music/createDisTube.js";
import type { BotClient } from "./core/types.js";
import { startGiveawayWatcher } from "./systems/giveaways.js";
import { startReminderWatcher } from "./systems/reminders.js";
import { logger } from "./utils/logger.js";

function createClient(): BotClient {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildModeration
    ],
    partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User]
  }) as BotClient;

  client.commands = new Collection();
  client.cooldowns = new Collection();

  return client;
}

function wireMongoLogs() {
  mongoose.connection.on("connected", () => logger.info("Mongo connected"));
  mongoose.connection.on("disconnected", () => logger.warn("Mongo disconnected"));
  mongoose.connection.on("reconnected", () => logger.info("Mongo reconnected"));
  mongoose.connection.on("error", (error) => logger.error({ err: error }, "Mongo error"));
}

async function bootstrap() {
  const env = loadEnv();
  const client = createClient();

  const rootDir = path.dirname(fileURLToPath(import.meta.url));
  const modulesRoot = path.join(rootDir, "modules");
  const eventsRoot = path.join(rootDir, "events");

  logger.info(
    {
      syncMode: env.NODE_ENV === "development" && env.DEV_GUILD_ID ? "guild" : "global",
      devGuildId: env.DEV_GUILD_ID
    },
    "Startup checks complete"
  );

  wireMongoLogs();
  await mongoose.connect(env.MONGO_URI);

  client.commands = await loadCommands(modulesRoot);
  await registerSlashCommands(env, client.commands);

  client.distube = await createDisTube(client);

  await loadEvents(client, eventsRoot);

  const apiServer = startApiServer(env, client);
  const giveawayInterval = startGiveawayWatcher(client);
  const reminderInterval = startReminderWatcher(client);

  const shutdown = async (signal: string) => {
    logger.warn({ signal }, "Shutting down");

    clearInterval(giveawayInterval);
    clearInterval(reminderInterval);

    if (apiServer) {
      apiServer.close();
    }

    await client.destroy();
    await mongoose.disconnect();

    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  await client.login(env.BOT_TOKEN);
}

bootstrap().catch((error) => {
  if (error instanceof ZodError) {
    const issueSummary = error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");

    logger.error({ issues: error.issues, summary: issueSummary }, "Fatal startup error (env validation)");
    console.error(`Fatal startup error (env validation): ${issueSummary}`);
    process.exit(1);
  }

  logger.error({ err: error }, "Fatal startup error");
  if (error instanceof Error) {
    console.error(`Fatal startup error: ${error.name}: ${error.message}`);
  } else {
    console.error("Fatal startup error:", error);
  }
  process.exit(1);
});
