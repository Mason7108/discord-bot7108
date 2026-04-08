import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { ensureDisTube } from "./shared.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder().setName("skip").setDescription("Skip current track"),
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
      await replyError(interaction, "No Queue", "No active music queue.");
      return;
    }

    await queue.skip();
    await replySuccess(interaction, "Skipped", "Track skipped.");
  }
};

export default command;
