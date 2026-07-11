import { SlashCommandBuilder, type Attachment, type GuildTextBasedChannel } from "discord.js";
import { Playlist, type DisTube, type Song } from "distube";
import type { CommandDefinition } from "../../../core/types.js";
import { CookieAwareYtDlpPlugin } from "../../../core/music/cookieAwareYtDlpPlugin.js";
import { ensureDisTube, ensureSameVoiceAsBot, getBotVoiceChannel, getMissingBotPlaybackPermissions } from "./shared.js";
import { errorEmbed, infoEmbed, successEmbed } from "../../../utils/embeds.js";
import { logger } from "../../../utils/logger.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

type PlayInput = string | Song | Playlist;
type PlaybackMetadata = {
  requestedBy: string;
  attachmentName?: string;
  attachmentDuration?: number;
};

const DEFAULT_MAX_MP3_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_MP3_ATTACHMENT_BYTES = 100 * 1024 * 1024;
const MP3_CONTENT_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/mpeg3", "audio/x-mpeg", "audio/x-mp3"]);

function isYouTubePlaylistLink(parsed: URL): boolean {
  return parsed.searchParams.has("list") && !parsed.searchParams.has("start_radio");
}

export function normalizePlayQuery(input: string): string {
  const trimmed = input.trim();

  if (!trimmed.includes("youtube.com/") && !trimmed.includes("youtu.be/")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);

    if (isYouTubePlaylistLink(parsed)) {
      return trimmed;
    }

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

function getMaxMp3AttachmentBytes(): number {
  const configured = Number(process.env.MP3_ATTACHMENT_MAX_BYTES);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_MAX_MP3_ATTACHMENT_BYTES;
  }

  return Math.min(Math.floor(configured), MAX_MP3_ATTACHMENT_BYTES);
}

function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}

function hasMp3Extension(name: string): boolean {
  return name.toLowerCase().endsWith(".mp3");
}

function getAttachmentDisplayName(attachment: Attachment): string {
  return attachment.title?.trim() || attachment.name || "uploaded.mp3";
}

function isMp3Attachment(attachment: Attachment): boolean {
  const contentType = attachment.contentType?.toLowerCase();
  return (contentType ? MP3_CONTENT_TYPES.has(contentType) : false) || hasMp3Extension(getAttachmentDisplayName(attachment));
}

function truncateDisplayValue(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}\[\]()#+\-.!|>])/g, "\\$1");
}

function boldDisplayValue(value: string): string {
  return `**${escapeMarkdown(truncateDisplayValue(value))}**`;
}

function formatTrackCount(count: number): string {
  return `${count} ${count === 1 ? "track" : "tracks"}`;
}

function getPlaybackStartedAction(input: PlayInput, isAttachmentInput: boolean): string {
  if (isAttachmentInput) {
    return "Queued uploaded MP3";
  }

  if (input instanceof Playlist) {
    return `Queued playlist with ${formatTrackCount(input.songs.length)}`;
  }

  return "Queued";
}

function isUrl(input: string): boolean {
  try {
    const parsed = new URL(input);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isYouTubeUrl(input: string): boolean {
  try {
    const parsed = new URL(input);
    return parsed.hostname.includes("youtube.com") || parsed.hostname === "youtu.be";
  } catch {
    return false;
  }
}

function getYtDlpPlugin(distube: DisTube): CookieAwareYtDlpPlugin | undefined {
  return distube.plugins.find((plugin): plugin is CookieAwareYtDlpPlugin => plugin instanceof CookieAwareYtDlpPlugin);
}

async function resolveYtDlpInput(
  distube: DisTube,
  query: string,
  resolveOptions: { member: never; metadata: { requestedBy: string } }
): Promise<PlayInput> {
  const ytDlpPlugin = getYtDlpPlugin(distube);
  if (!ytDlpPlugin) {
    return query;
  }

  if (isYouTubeUrl(query)) {
    return ytDlpPlugin.resolve(query, resolveOptions);
  }

  if (isUrl(query)) {
    return query;
  }

  return ytDlpPlugin.resolveSearch(query, resolveOptions);
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
    .setDescription("Open bot7108 Activity, or play through the bot with a query or MP3")
    .addStringOption((option) => option.setName("query").setDescription("Song/playlist URL or query").setRequired(false))
    .addAttachmentOption((option) => option.setName("file").setDescription("MP3 file to upload and play").setRequired(false)),
  module: "music",
  cooldownSec: 2,
  roleRequirement: "User",
  async execute({ client, interaction }) {
    const query = interaction.options.getString("query")?.trim();
    const attachment = interaction.options.getAttachment("file");

    if (!query && !attachment) {
      const distube = ensureDisTube(client);
      const voiceCheck = ensureSameVoiceAsBot(interaction);
      if (!distube || !interaction.guild) {
        await replyError(interaction, "Music Unavailable", "Music service is not initialized.");
        return;
      }
      if (!voiceCheck.ok || !voiceCheck.voiceChannel) {
        await replyError(interaction, "Join Voice", voiceCheck.reason ?? "Join a voice channel before launching bot7108 Activity.");
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

      await interaction.launchActivity();

      if (!getBotVoiceChannel(interaction)) {
        try {
          await distube.voices.join(voiceCheck.voiceChannel);
        } catch (error) {
          logger.warn(
            { err: error, guildId: interaction.guildId, channelId: voiceCheck.voiceChannel.id },
            "Failed to join voice after launching bot7108 Activity"
          );
          await interaction.followUp({
            content: "The Activity opened, but I could not join your voice channel. Check my Connect, Speak, and Use Voice Activity permissions.",
            ephemeral: true
          }).catch(() => undefined);
        }
      }
      return;
    }

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

    if (query && attachment) {
      await replyError(interaction, "Choose One Input", "Use either a song URL/search query or an MP3 upload, not both.");
      return;
    }

    const maxAttachmentBytes = getMaxMp3AttachmentBytes();
    if (attachment) {
      if (!isMp3Attachment(attachment)) {
        await replyError(interaction, "Invalid File", "Upload an `.mp3` file. Other audio formats are not supported yet.");
        return;
      }

      if (attachment.size > maxAttachmentBytes) {
        await replyError(
          interaction,
          "MP3 Too Large",
          `Upload an MP3 smaller than ${formatBytes(maxAttachmentBytes)}. This file is ${formatBytes(attachment.size)}.`
        );
        return;
      }
    }

    const isAttachmentInput = Boolean(attachment);
    const playSource = attachment?.url ?? normalizePlayQuery(query ?? "");
    const displayLabel = attachment ? getAttachmentDisplayName(attachment) : playSource;
    const resolveOptions = {
      member: interaction.member as never,
      metadata: {
        requestedBy: interaction.user.id,
        attachmentName: attachment ? getAttachmentDisplayName(attachment) : undefined,
        attachmentDuration: attachment?.duration ?? undefined
      } satisfies PlaybackMetadata
    };
    const playOptions = {
      textChannel: interaction.channel as GuildTextBasedChannel,
      ...resolveOptions
    };

    // Song resolution can take >3 seconds; acknowledge early to avoid interaction timeout.
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    await interaction.editReply({
      embeds: [
        infoEmbed(
          "Joining Voice",
          `Joining ${voiceCheck.voiceChannel.toString()} and ${
            isAttachmentInput ? "loading uploaded MP3" : "searching for"
          }: ${boldDisplayValue(displayLabel)}`
        )
      ]
    });

    let playableInput: PlayInput = playSource;
    const botVoiceBeforeJoin = getBotVoiceChannel(interaction);

    try {
      await distube.voices.join(voiceCheck.voiceChannel);
      if (!isAttachmentInput) {
        playableInput = await resolveYtDlpInput(distube, playSource, resolveOptions);
      }
      await distube.play(voiceCheck.voiceChannel, playableInput, playOptions);
    } catch (error) {
      if (!botVoiceBeforeJoin && interaction.guildId) {
        distube.voices.leave(interaction.guildId);
      }

      if (isVoiceConnectionTimeout(error) && interaction.guildId) {
        // Retry once after forcing a clean voice reconnect.
        try {
          distube.voices.leave(interaction.guildId);
          await new Promise((resolve) => setTimeout(resolve, 1_000));
          await distube.voices.join(voiceCheck.voiceChannel);
          if (typeof playableInput === "string" && !isAttachmentInput) {
            playableInput = await resolveYtDlpInput(distube, playSource, resolveOptions);
          }
          await distube.play(voiceCheck.voiceChannel, playableInput, playOptions);
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
        embeds: [
          successEmbed(
            "Playback Started",
            `${getPlaybackStartedAction(playableInput, isAttachmentInput)}: ${boldDisplayValue(displayLabel)}`
          )
        ]
      });
    } else {
      await replySuccess(
        interaction,
        "Playback Started",
        `${getPlaybackStartedAction(playableInput, isAttachmentInput)}: ${boldDisplayValue(displayLabel)}`
      );
    }
  }
};

export default command;
