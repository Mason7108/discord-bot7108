import { Collection } from "discord.js";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { CommandDefinition } from "../types.js";
import { isRuntimeScript, walkFiles } from "./fileWalker.js";
import { logger } from "../../utils/logger.js";

function isCommandDefinition(value: unknown): value is CommandDefinition {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "data" in value && "execute" in value && "module" in value;
}

export async function loadCommands(commandsRoot: string): Promise<Collection<string, CommandDefinition>> {
  const commands = new Collection<string, CommandDefinition>();

  const allFiles = await walkFiles(commandsRoot);
  const commandFiles = allFiles.filter((file) => file.includes(`${path.sep}commands${path.sep}`) && isRuntimeScript(file));

  for (const filePath of commandFiles) {
    const imported = await import(pathToFileURL(filePath).href);
    const command: unknown = imported.default ?? imported.command;

    if (!isCommandDefinition(command)) {
      continue;
    }

    const name = command.data.name;
    commands.set(name, command);
    logger.debug({ command: name, filePath }, "Loaded command");
  }

  logger.info({ count: commands.size }, "Commands loaded");

  return commands;
}
