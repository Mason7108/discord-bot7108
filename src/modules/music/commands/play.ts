import { SlashCommandBuilder, type GuildTextBasedChannel } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { ensureDisTube, ensureSameVoiceAsBot, getMissingBotPlaybackPermissions } from "./shared.js";
import { errorEmbed, successEmbed } from "../../../utils/embeds.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

function normalizePlayQuery(input: string): string {
  const trimmed = input.trim();

  if (!trimmed.includes("youtube.com/") && !trimmed.includes("youtu.be/")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);

    // When users paste YouTube mix/radio links, keep just the actual video URL.
    if (parsed.hostname.includes("youtube.com") && parsed.searchParams.has("v")) {
      const videoId = parsed.searchParams.get("v");
      if (videoId) {
        return `https://www.youtube.com/watch?v=${videoId}`;
      }
    }

    if (parsed.hostname.includes("youtu.be")) {
      return `https://youtu.be/${parsed.pathname.replace("/", "").trim()}`;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

function formatPlaybackError(error: unknown): string {
  if (error instanceof Error) {
    const compactMessage = error.message.replace(/\s+/g, " ").trim();
    if (compactMessage.length > 0) {
      return compactMessage.length > 220 ? `${compactMessage.slice(0, 220)}...` : compactMessage;
    }
  }

  return "Unknown playback error.";
}

function isVoiceConnectionTimeout(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Cannot connect to the voice channel after 30 seconds");
}

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
    const normalizedQuery = normalizePlayQuery(query);
    const playOptions = {
      textChannel: interaction.channel as GuildTextBasedChannel,
      member: interaction.member as never,
      metadata: {
        requestedBy: interaction.user.id
      }
    };

    // Song resolution can take >3 seconds; acknowledge early to avoid interaction timeout.
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    try {
      await distube.play(voiceCheck.voiceChannel, normalizedQuery, playOptions);
    } catch (error) {
      if (isVoiceConnectionTimeout(error) && interaction.guildId) {
        // Retry once after forcing a clean voice reconnect.
        try {
          distube.voices.leave(interaction.guildId);
          await new Promise((resolve) => setTimeout(resolve, 1_000));
          await distube.play(voiceCheck.voiceChannel, normalizedQuery, playOptions);
        } catch (retryError) {
          const errorReason = formatPlaybackError(retryError);
          const helpfulHint =
            "Make sure the bot can Connect, Speak, and Use Voice Activity in that channel and try a normal voice channel (not Stage).";

          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
              embeds: [errorEmbed("Playback Failed", `I could not play that song. ${errorReason}\n${helpfulHint}`)]
            });
          } else {
            await replyError(interaction, "Playback Failed", `I could not play that song. ${errorReason}\n${helpfulHint}`);
          }
          return;
        }
      } else {
        const errorReason = formatPlaybackError(error);
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            embeds: [errorEmbed("Playback Failed", `I could not play that song. ${errorReason}`)]
          });
        } else {
          await replyError(interaction, "Playback Failed", `I could not play that song. ${errorReason}`);
        }
        return;
      }
    }

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        embeds: [successEmbed("Playback Started", `Searching for: **${normalizedQuery}**`)]
      });
    } else {
      await replySuccess(interaction, "Playback Started", `Searching for: **${normalizedQuery}**`);
    }
  }
};

export default command;
