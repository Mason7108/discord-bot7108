import { SlashCommandBuilder, type GuildTextBasedChannel } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { ensureDisTube, ensureSameVoiceAsBot, getMissingBotPlaybackPermissions } from "./shared.js";
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

    const voiceCheck = ensureSameVoiceAsBot(interaction);
    if (!voiceCheck.ok || !voiceCheck.voiceChannel) {
      await replyError(interaction, "Join Voice", voiceCheck.reason ?? "You must join a voice channel first.");
      return;
    }

    const missingPermissions = getMissingBotPlaybackPermissions(interaction, voiceCheck.voiceChannel);
    if (missingPermissions.length > 0) {
      await replyError(
        interaction,
        "Missing Permissions",
        `I need these permissions in ${voiceCheck.voiceChannel.toString()}: ${missingPermissions.map((permission) => `\`${permission}\``).join(", ")}.`
      );
      return;
    }

    const query = interaction.options.getString("query", true);

    try {
      await distube.play(voiceCheck.voiceChannel, query, {
        textChannel: interaction.channel as GuildTextBasedChannel,
        member: interaction.member as never,
        metadata: {
          requestedBy: interaction.user.id
        }
      });
    } catch {
      await replyError(interaction, "Playback Failed", "I could not play that song. Try another search or URL.");
      return;
    }

    await replySuccess(interaction, "Playback Started", `Searching for: **${query}**`);
  }
};

export default command;
