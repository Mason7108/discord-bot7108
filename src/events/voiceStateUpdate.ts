import type { VoiceState } from "discord.js";
import type { EventDefinition } from "../core/types.js";
import { stopVoiceCommandListener, syncVoiceCommandListener } from "../features/voiceCommands/listener.js";

const event: EventDefinition = {
  name: "voiceStateUpdate",
  async execute(client, rawOldState, rawNewState) {
    const oldState = rawOldState as VoiceState;
    const newState = rawNewState as VoiceState;

    if (oldState.id !== client.user?.id && newState.id !== client.user?.id) {
      return;
    }

    const guildId = newState.guild.id;
    if (!newState.channelId) {
      stopVoiceCommandListener(guildId);
      return;
    }

    await syncVoiceCommandListener(client, guildId);
  }
};

export default event;
