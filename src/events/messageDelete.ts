import { EmbedBuilder } from "discord.js";
import type { EventDefinition } from "../core/types.js";
import { getGuildSettings } from "../core/services/guildSettingsService.js";
import { sendModLog } from "../systems/logging.js";

const event: EventDefinition = {
  name: "messageDelete",
  async execute(_client, rawMessage) {
    const message = rawMessage as any;
    if (!message.guild || !message.author) {
      return;
    }

    const settings = await getGuildSettings(message.guild.id);
    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle("Message Deleted")
      .addFields(
        { name: "Author", value: `${message.author.tag}` },
        { name: "Channel", value: `${message.channel}` },
        { name: "Content", value: (message.content || "(no content)").slice(0, 900) }
      )
      .setTimestamp();

    await sendModLog(message.guild, settings, embed);
  }
};

export default event;
