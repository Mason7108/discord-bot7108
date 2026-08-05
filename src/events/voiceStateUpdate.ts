import { EmbedBuilder } from "discord.js";
import type { VoiceState } from "discord.js";
import { getGuildSettings } from "../core/services/guildSettingsService.js";
import type { EventDefinition } from "../core/types.js";
import { stopVoiceCommandListener, syncVoiceCommandListener } from "../features/voiceCommands/listener.js";
import { sendModLog } from "../systems/logging.js";

const event: EventDefinition = {
  name: "voiceStateUpdate",
  async execute(client, rawOldState, rawNewState) {
    const oldState = rawOldState as VoiceState;
    const newState = rawNewState as VoiceState;

    if (oldState.id !== client.user?.id && newState.id !== client.user?.id) {
      if (oldState.channelId === newState.channelId || newState.member?.user.bot) {
        return;
      }

      const settings = await getGuildSettings(newState.guild.id);
      const action = !oldState.channelId ? "joined" : !newState.channelId ? "left" : "moved";
      const channelText =
        action === "joined"
          ? `<#${newState.channelId}>`
          : action === "left"
            ? `<#${oldState.channelId}>`
            : `<#${oldState.channelId}> -> <#${newState.channelId}>`;
      const embed = new EmbedBuilder()
        .setColor(0x22d3ee)
        .setTitle("Voice Activity")
        .addFields(
          { name: "Member", value: `${newState.member?.user.tag ?? newState.id} (${newState.id})` },
          { name: "Action", value: action },
          { name: "Channel", value: channelText }
        )
        .setTimestamp();

      await sendModLog(newState.guild, settings, embed, "voiceActivity");
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
