import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { ensureDisTube, ensureSameVoiceAsBot } from "./shared.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder().setName("resume").setDescription("Resume paused playback"),
  module: "music",
  cooldownSec: 2,
  async execute({ client, interaction }) {
    const distube = ensureDisTube(client);
    if (!distube || !interaction.guild) {
      await replyError(interaction, "Music Unavailable", "Music service is not initialized.");
      return;
    }

    const voiceCheck = ensureSameVoiceAsBot(interaction);
    if (!voiceCheck.ok) {
      await replyError(interaction, "Join Voice", voiceCheck.reason ?? "You must join a voice channel first.");
      return;
    }

    const queue = distube.getQueue(interaction.guild.id);
    if (!queue) {
      await replyError(interaction, "No Queue", "No active music queue.");
      return;
    }

    queue.resume();
    await replySuccess(interaction, "Resumed", "Playback resumed.");
  }
};

export default command;
