import type { EventDefinition } from "../core/types.js";
import { getGuildSettings } from "../core/services/guildSettingsService.js";
import { hasAcceptedTerms } from "../core/services/termsAgreementService.js";
import { processLevelingMessage } from "../systems/leveling.js";
import { runAutomod } from "../systems/automod.js";
import { processVoiceTextToSpeechMessage } from "../systems/voiceTextToSpeech.js";
import { logger } from "../utils/logger.js";

const event: EventDefinition = {
  name: "messageCreate",
  async execute(client, rawMessage) {
    const message = rawMessage as any;

    if (!message.guild || message.author?.bot) {
      return;
    }

    const settings = await getGuildSettings(message.guild.id);

    await runAutomod(message, settings);

    const acceptedTerms = await hasAcceptedTerms(message.guild.id, message.author.id).catch((error) => {
      logger.error({ err: error, guildId: message.guild.id, userId: message.author.id }, "Failed to check terms agreement for message");
      return false;
    });

    if (!acceptedTerms) {
      return;
    }

    await processLevelingMessage(message, settings);
    await processVoiceTextToSpeechMessage(client, message, settings);
  }
};

export default event;
