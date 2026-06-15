import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { ensureDisTube, ensureSameVoiceAsBot, getBotVoiceChannel } from "./shared.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder().setName("leave").setDescription("Leave the current voice channel"),
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
      await replyError(interaction, "Join Voice", voiceCheck.reason ?? "You must join the bot's voice channel first.");
      return;
    }

    const botVoiceChannel = getBotVoiceChannel(interaction);
    if (!botVoiceChannel) {
      await replyError(interaction, "Not Connected", "I am not in a voice channel.");
      return;
    }

    distube.voices.leave(interaction.guild.id);
    await replySuccess(interaction, "Left Voice", `Left ${botVoiceChannel.toString()}.`);
  }
};

export default command;
