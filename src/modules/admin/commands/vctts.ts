import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { updateGuildSettings } from "../../../core/services/guildSettingsService.js";
import {
  getVoiceTextToSpeechConfig,
  getVoiceTextToSpeechEngineStatus,
  stopVoiceTextToSpeech
} from "../../../systems/voiceTextToSpeech.js";
import { infoEmbed } from "../../../utils/embeds.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("vctts")
    .setDescription("Enable, disable, or inspect voice channel chat text-to-speech")
    .addSubcommand((sub) => sub.setName("enable").setDescription("Read voice channel chat messages aloud in voice"))
    .addSubcommand((sub) => sub.setName("disable").setDescription("Disable voice channel chat text-to-speech"))
    .addSubcommand((sub) => sub.setName("status").setDescription("Show voice channel TTS status")),
  module: "admin",
  cooldownSec: 2,
  userPerms: [PermissionFlagsBits.ManageGuild],
  roleRequirement: "Admin",
  async execute({ interaction, settings }) {
    if (!interaction.guildId) {
      await replyError(interaction, "Unavailable", "This command is only available in servers.");
      return;
    }

    const subcommand = interaction.options.getSubcommand(true);

    if (subcommand === "status") {
      const engine = await getVoiceTextToSpeechEngineStatus();
      const config = getVoiceTextToSpeechConfig();
      const description = [
        `Enabled: **${settings.voiceTextToSpeech.enabled ? "yes" : "no"}**`,
        `Engine: \`${config.enginePath}\``,
        `Voice: \`${config.voice}\``,
        `Max message length: **${config.maxChars} characters**`,
        `Engine status: **${engine.ok ? "available" : "unavailable"}**${engine.reason ? `\n${engine.reason}` : ""}`,
        "",
        "When enabled, messages typed in a voice channel's text chat are spoken only if the author is connected to that same voice channel."
      ].join("\n");

      await interaction.reply({ embeds: [infoEmbed("VC TTS Status", description)], ephemeral: true });
      return;
    }

    if (subcommand === "disable") {
      await updateGuildSettings(interaction.guildId, {
        voiceTextToSpeech: {
          ...settings.voiceTextToSpeech,
          enabled: false
        }
      } as never);
      stopVoiceTextToSpeech(interaction.guildId);
      await replySuccess(interaction, "VC TTS Disabled", "Voice channel chat messages will no longer be read aloud.");
      return;
    }

    const engine = await getVoiceTextToSpeechEngineStatus();
    if (!engine.ok) {
      await replyError(
        interaction,
        "TTS Engine Unavailable",
        `${engine.reason ?? "The TTS engine is unavailable."}\nInstall \`espeak-ng\` or set \`VC_TTS_ENGINE_PATH\`, then restart the bot.`
      );
      return;
    }

    await updateGuildSettings(interaction.guildId, {
      voiceTextToSpeech: {
        enabled: true
      }
    } as never);

    await replySuccess(
      interaction,
      "VC TTS Enabled",
      "Messages typed in a voice channel's text chat will be read aloud when the author is connected to that same voice channel."
    );
  }
};

export default command;
