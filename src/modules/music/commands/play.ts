import { SlashCommandBuilder, type GuildTextBasedChannel } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { ensureDisTube, getVoiceChannel } from "./shared.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a track from URL or search query")
    .addStringOption((option) => option.setName("query").setDescription("Song URL or query").setRequired(true)),
  module: "music",
  cooldownSec: 2,
  roleRequirement: "User",
  async execute({ client, interaction }) {
    const distube = ensureDisTube(client);
    if (!distube || !interaction.guild || !interaction.channel || interaction.channel.isDMBased()) {
      await replyError(interaction, "Music Unavailable", "Music service is not initialized.");
      return;
    }

    const voiceChannel = getVoiceChannel(interaction);
    if (!voiceChannel) {
      await replyError(interaction, "Join Voice", "You must join a voice channel first.");
      return;
    }

    const query = interaction.options.getString("query", true);

    await distube.play(voiceChannel, query, {
      textChannel: interaction.channel as GuildTextBasedChannel,
      member: interaction.member as never,
      metadata: {
        requestedBy: interaction.user.id
      }
    });

    await replySuccess(interaction, "Playback Started", `Searching for: **${query}**`);
  }
};

export default command;
