import { REST, Routes } from "discord.js";
import type { Collection } from "discord.js";
import type { CommandDefinition } from "../types.js";
import type { Env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";

type RawApplicationCommand = {
  id?: string;
  type?: number;
  name?: string;
  description?: string;
  name_localizations?: Record<string, string> | null;
  description_localizations?: Record<string, string> | null;
  default_member_permissions?: string | null;
  dm_permission?: boolean;
  nsfw?: boolean;
  integration_types?: number[];
  contexts?: number[];
  handler?: number;
  options?: unknown[];
};

const PRIMARY_ENTRY_POINT_COMMAND_TYPE = 4;

function isRawApplicationCommand(value: unknown): value is RawApplicationCommand {
  return typeof value === "object" && value !== null;
}

function sanitizeCommandForOverwrite(command: RawApplicationCommand): RawApplicationCommand | null {
  if (!command.name || typeof command.name !== "string") {
    return null;
  }

  return {
    id: command.id,
    type: command.type,
    name: command.name,
    description: command.description,
    name_localizations: command.name_localizations,
    description_localizations: command.description_localizations,
    default_member_permissions: command.default_member_permissions,
    dm_permission: command.dm_permission,
    nsfw: command.nsfw,
    integration_types: command.integration_types,
    contexts: command.contexts,
    handler: command.handler,
    options: command.options
  };
}

async function getPrimaryEntryPointCommands(rest: REST, clientId: string): Promise<RawApplicationCommand[]> {
  const existingCommands = await rest.get(Routes.applicationCommands(clientId));
  if (!Array.isArray(existingCommands)) {
    return [];
  }

  return existingCommands
    .filter((command): command is RawApplicationCommand => {
      return isRawApplicationCommand(command) && command.type === PRIMARY_ENTRY_POINT_COMMAND_TYPE;
    })
    .map(sanitizeCommandForOverwrite)
    .filter((command): command is RawApplicationCommand => Boolean(command));
}

export async function registerSlashCommands(env: Env, commands: Collection<string, CommandDefinition>) {
  const rest = new REST({ version: "10" }).setToken(env.BOT_TOKEN);
  const commandData = commands.map((command) => command.data.toJSON());

  if (env.NODE_ENV === "development" && env.DEV_GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(env.CLIENT_ID, env.DEV_GUILD_ID), { body: commandData });
    logger.info({ count: commandData.length, guildId: env.DEV_GUILD_ID }, "Registered guild slash commands");
    return;
  }

  const entryPointCommands = await getPrimaryEntryPointCommands(rest, env.CLIENT_ID);
  await rest.put(Routes.applicationCommands(env.CLIENT_ID), { body: [...commandData, ...entryPointCommands] });
  logger.info(
    { count: commandData.length, preservedEntryPointCommands: entryPointCommands.length },
    "Registered global slash commands"
  );
}
