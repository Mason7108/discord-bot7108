import { Message } from "discord.js";
import { loadEnv } from "../config/env.js";
import type { EventDefinition } from "../core/types.js";
import { getGuildSettings } from "../core/services/guildSettingsService.js";
import { logEditedMessage } from "../systems/messageLogs.js";

const env = loadEnv();

const event: EventDefinition = {
  name: "messageUpdate",
  async execute(_client, rawOldMessage, rawNewMessage) {
    const oldMessage = rawOldMessage as Message;
    const newMessage = rawNewMessage as Message;

    const guildId = newMessage.guildId ?? oldMessage.guildId;
    if (!guildId) {
      return;
    }

    const settings = await getGuildSettings(guildId);
    await logEditedMessage({ oldMessage, newMessage, env, settings });
  }
};

export default event;
