import { EmbedBuilder, type GuildBasedChannel } from "discord.js";
import type { EventDefinition } from "../core/types.js";
import { getGuildSettings } from "../core/services/guildSettingsService.js";
import { sendModLog } from "../systems/logging.js";

const event: EventDefinition = {
  name: "channelUpdate",
  async execute(_client, rawOldChannel, rawNewChannel) {
    const oldChannel = rawOldChannel as GuildBasedChannel;
    const newChannel = rawNewChannel as GuildBasedChannel;
    if (!("guild" in newChannel)) {
      return;
    }

    const settings = await getGuildSettings(newChannel.guild.id);
    const changes: string[] = [];
    if ("name" in oldChannel && "name" in newChannel && oldChannel.name !== newChannel.name) {
      changes.push(`Name: ${oldChannel.name} -> ${newChannel.name}`);
    }
    if ("position" in oldChannel && "position" in newChannel && oldChannel.position !== newChannel.position) {
      changes.push(`Position: ${oldChannel.position} -> ${newChannel.position}`);
    }

    if (changes.length === 0) {
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x22d3ee)
      .setTitle("Channel Updated")
      .addFields(
        { name: "Channel", value: `${"name" in newChannel ? newChannel.name : "Unknown"} (${newChannel.id})` },
        { name: "Changes", value: changes.slice(0, 8).join("\n") }
      )
      .setTimestamp();

    await sendModLog(newChannel.guild, settings, embed, "channelUpdates");
  }
};

export default event;
