import path from "node:path";
import { pathToFileURL } from "node:url";
import type { BotClient, EventDefinition } from "../types.js";
import { isRuntimeScript, walkFiles } from "./fileWalker.js";
import { logger } from "../../utils/logger.js";

function isEventDefinition(value: unknown): value is EventDefinition {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "name" in value && "execute" in value;
}

export async function loadEvents(client: BotClient, eventsRoot: string): Promise<void> {
  const allFiles = await walkFiles(eventsRoot);
  const eventFiles = allFiles.filter((file) => isRuntimeScript(file));

  for (const filePath of eventFiles) {
    const imported = await import(pathToFileURL(filePath).href);
    const event: unknown = imported.default ?? imported.event;

    if (!isEventDefinition(event)) {
      continue;
    }

    if (event.once) {
      client.once(event.name, (...args) => {
        void event.execute(client, ...args);
      });
    } else {
      client.on(event.name, (...args) => {
        void event.execute(client, ...args);
      });
    }

    logger.debug({ event: event.name, filePath }, "Loaded event");
  }

  logger.info("Events loaded");
}
