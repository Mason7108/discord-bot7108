import type { EventDefinition } from "../core/types.js";
import { getGuildSettings } from "../core/services/guildSettingsService.js";
import { processLevelingMessage } from "../systems/leveling.js";
import { runAutomod } from "../systems/automod.js";
import { processVoiceTextToSpeechMessage } from "../systems/voiceTextToSpeech.js";

const event: EventDefinition = {
  name: "messageCreate",
  async execute(client, rawMessage) {
    const message = rawMessage as any;

    if (!message.guild || message.author?.bot) {
      return;
    }

    const settings = await getGuildSettings(message.guild.id);

    await runAutomod(message, settings);

    await processLevelingMessage(message, settings);
    await processVoiceTextToSpeechMessage(client, message, settings);
  }
};

export default event;
