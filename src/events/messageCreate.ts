import type { EventDefinition } from "../core/types.js";
import { getGuildSettings } from "../core/services/guildSettingsService.js";
import { processLevelingMessage } from "../systems/leveling.js";
import { runAutomod } from "../systems/automod.js";

const event: EventDefinition = {
  name: "messageCreate",
  async execute(_client, rawMessage) {
    const message = rawMessage as any;

    if (!message.guild || message.author?.bot) {
      return;
    }

    const settings = await getGuildSettings(message.guild.id);

    await runAutomod(message, settings);
    await processLevelingMessage(message, settings);
  }
};

export default event;
