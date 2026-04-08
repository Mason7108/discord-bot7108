import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { ensureDisTube } from "./shared.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder().setName("stop").setDescription("Stop playback and clear queue"),
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

    queue.stop();
    await replySuccess(interaction, "Stopped", "Playback stopped and queue cleared.");
  }
};

export default command;
