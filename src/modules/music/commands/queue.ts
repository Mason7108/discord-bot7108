import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { ensureDisTube } from "./shared.js";
import { infoEmbed } from "../../../utils/embeds.js";
import { replyError } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder().setName("queue").setDescription("Show the current music queue"),
  module: "music",
  cooldownSec: 2,
  async execute({ client, interaction }) {
    const distube = ensureDisTube(client);
    if (!distube || !interaction.guild) {
      await replyError(interaction, "Music Unavailable", "Music service is not initialized.");
      return;
    }

    const queue = distube.getQueue(interaction.guild.id);
    if (!queue || queue.songs.length === 0) {
      await replyError(interaction, "No Queue", "The queue is empty.");
      return;
    }

    const lines = queue.songs.slice(0, 10).map((song, index) => `${index + 1}. ${song.name} (${song.formattedDuration})`);
    await interaction.reply({ embeds: [infoEmbed("Music Queue", lines.join("\n"))] });
  }
};

export default command;
