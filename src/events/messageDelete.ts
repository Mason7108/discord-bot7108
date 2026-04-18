import { Message } from "discord.js";
import { loadEnv } from "../config/env.js";
import type { EventDefinition } from "../core/types.js";
import { getGuildSettings } from "../core/services/guildSettingsService.js";
import { logDeletedMessage } from "../systems/messageLogs.js";

const env = loadEnv();

const event: EventDefinition = {
  name: "messageDelete",
  async execute(_client, rawMessage) {
    const message = rawMessage as Message;
    if (!message.guildId) {
      return;
    }

    const settings = await getGuildSettings(message.guildId);
    await logDeletedMessage({ message, env, settings });
  }
};

export default event;
