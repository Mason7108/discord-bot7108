import { REST, Routes } from "discord.js";
import type { Collection } from "discord.js";
import type { CommandDefinition } from "../types.js";
import type { Env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";

export async function registerSlashCommands(env: Env, commands: Collection<string, CommandDefinition>) {
  const rest = new REST({ version: "10" }).setToken(env.BOT_TOKEN);
  const commandData = commands.map((command) => command.data.toJSON());

  if (env.NODE_ENV === "development" && env.DEV_GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(env.CLIENT_ID, env.DEV_GUILD_ID), { body: commandData });
    logger.info({ count: commandData.length, guildId: env.DEV_GUILD_ID }, "Registered guild slash commands");
    return;
  }

  await rest.put(Routes.applicationCommands(env.CLIENT_ID), { body: commandData });
  logger.info({ count: commandData.length }, "Registered global slash commands");
}
