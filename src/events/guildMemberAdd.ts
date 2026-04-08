import { EmbedBuilder } from "discord.js";
import type { EventDefinition } from "../core/types.js";
import { getGuildSettings } from "../core/services/guildSettingsService.js";
import { sendModLog } from "../systems/logging.js";

const event: EventDefinition = {
  name: "guildMemberAdd",
  async execute(_client, rawMember) {
    const member = rawMember as any;
    if (!member.guild) {
      return;
    }

    const settings = await getGuildSettings(member.guild.id);
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("Member Joined")
      .setDescription(`${member.user.tag} joined the server.`)
      .setTimestamp();

    await sendModLog(member.guild, settings, embed);
  }
};

export default event;
