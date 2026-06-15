import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, type GuildTextBasedChannel } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { updateGuildSettings } from "../../../core/services/guildSettingsService.js";
import { getVoiceRecognitionStatus } from "../../../features/voiceCommands/transcribe.js";
import { stopVoiceCommandListener, syncVoiceCommandListener } from "../../../features/voiceCommands/listener.js";
import { VOICE_COMMAND_PRIVACY_NOTICE } from "../../../features/voiceCommands/voiceCommandRouter.js";
import { infoEmbed } from "../../../utils/embeds.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

function isUsableGuildTextChannel(channel: unknown): channel is GuildTextBasedChannel {
  return Boolean(
    channel &&
      typeof channel === "object" &&
      "isTextBased" in channel &&
      typeof (channel as { isTextBased: () => boolean }).isTextBased === "function" &&
      (channel as { isTextBased: () => boolean }).isTextBased() &&
      "isDMBased" in channel &&
      typeof (channel as { isDMBased: () => boolean }).isDMBased === "function" &&
      !(channel as { isDMBased: () => boolean }).isDMBased()
  );
}

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("voicecommands")
    .setDescription("Enable, disable, or inspect spoken music commands")
    .addSubcommand((sub) =>
      sub
        .setName("enable")
        .setDescription("Enable spoken music commands for this server")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Text channel for voice command notices and errors")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
    )
    .addSubcommand((sub) => sub.setName("disable").setDescription("Disable spoken music commands for this server"))
    .addSubcommand((sub) => sub.setName("status").setDescription("Show voice command status")),
  module: "admin",
  cooldownSec: 2,
  userPerms: [PermissionFlagsBits.ManageGuild],
  roleRequirement: "Admin",
  async execute({ client, interaction, settings }) {
    if (!interaction.guildId || !interaction.guild) {
      await replyError(interaction, "Unavailable", "This command is only available in servers.");
      return;
    }

    const subcommand = interaction.options.getSubcommand(true);

    if (subcommand === "status") {
      const recognition = getVoiceRecognitionStatus();
      const voiceChannel = interaction.guild.members.me?.voice.channel;
      const textChannelId = settings.voiceCommands.textChannelId;
      const description = [
        `Enabled: **${settings.voiceCommands.enabled ? "yes" : "no"}**`,
        `Listening now: **${settings.voiceCommands.enabled && voiceChannel ? "yes" : "no"}**${voiceChannel ? ` in ${voiceChannel.toString()}` : ""}`,
        `Notice channel: ${textChannelId ? `<#${textChannelId}>` : "not set"}`,
        `Voice recognition: **${recognition.ok ? "available" : "unavailable"}**${recognition.reason ? `\n${recognition.reason}` : ""}`,
        "",
        VOICE_COMMAND_PRIVACY_NOTICE
      ].join("\n");

      await interaction.reply({ embeds: [infoEmbed("Voice Command Status", description)], ephemeral: true });
      return;
    }

    if (subcommand === "disable") {
      await updateGuildSettings(interaction.guildId, {
        voiceCommands: {
          ...settings.voiceCommands,
          enabled: false
        }
      } as never);
      stopVoiceCommandListener(interaction.guildId);
      await replySuccess(interaction, "Voice Commands Disabled", "Spoken music commands are disabled for this server.");
      return;
    }

    const recognition = getVoiceRecognitionStatus();
    if (!recognition.ok) {
      await replyError(interaction, "Voice Recognition Unavailable", recognition.reason ?? "Voice recognition is unavailable.");
      return;
    }

    const selectedChannel = interaction.options.getChannel("channel") ?? interaction.channel;
    if (!isUsableGuildTextChannel(selectedChannel)) {
      await replyError(interaction, "Notice Channel Required", "Run this command in a server text channel or pass a text channel.");
      return;
    }

    const botMember = interaction.guild.members.me;
    const botPermissions = botMember ? selectedChannel.permissionsFor(botMember) : null;
    if (!botPermissions?.has(PermissionFlagsBits.SendMessages)) {
      await replyError(interaction, "Missing Permissions", `I need permission to send messages in ${selectedChannel.toString()}.`);
      return;
    }

    await updateGuildSettings(interaction.guildId, {
      voiceCommands: {
        enabled: true,
        textChannelId: selectedChannel.id
      }
    } as never);

    await syncVoiceCommandListener(client, interaction.guildId);

    await replySuccess(
      interaction,
      "Voice Commands Enabled",
      [
        `Spoken music commands are enabled. Notices and errors will be posted in ${selectedChannel.toString()}.`,
        "Wake phrase: `hey bot7108`.",
        VOICE_COMMAND_PRIVACY_NOTICE
      ].join("\n")
    );
  }
};

export default command;
