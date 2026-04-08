import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { clamp } from "../../../utils/math.js";
import { ensureDisTube } from "./shared.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Set music volume")
    .addIntegerOption((option) =>
      option
        .setName("percent")
        .setDescription("Volume percentage")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(150)
    ),
  module: "music",
  cooldownSec: 2,
  async execute({ client, interaction }) {
    const distube = ensureDisTube(client);
    if (!distube || !interaction.guild) {
      await replyError(interaction, "Music Unavailable", "Music service is not initialized.");
      return;
    }

    const queue = distube.getQueue(interaction.guild.id);
    if (!queue) {
      await replyError(interaction, "No Queue", "No active queue.");
      return;
    }

    const percent = clamp(interaction.options.getInteger("percent", true), 1, 150);
    queue.setVolume(percent);
    await replySuccess(interaction, "Volume Updated", `Volume set to **${percent}%**.`);
  }
};

export default command;
