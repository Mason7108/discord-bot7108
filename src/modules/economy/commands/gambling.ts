import { SlashCommandBuilder } from "discord.js";
import { loadEnv } from "../../../config/env.js";
import { updateGuildSettings } from "../../../core/services/guildSettingsService.js";
import type { CommandDefinition } from "../../../core/types.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const env = loadEnv();

function isOwnerUser(interaction: any): boolean {
  const ownerId = env.BOT_OWNER_ID?.trim();
  if (ownerId) {
    return interaction.user.id === ownerId;
  }

  return interaction.guild && interaction.user.id === interaction.guild.ownerId;
}

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("gambling")
    .setDescription("Owner-only gambling controls")
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Enable or disable gambling commands")
        .addBooleanOption((option) => option.setName("enabled").setDescription("Enable or disable gambling").setRequired(true))
    )
    .addSubcommand((sub) => sub.setName("status").setDescription("Check if gambling commands are enabled")),
  module: "economy",
  cooldownSec: 2,
  async execute({ interaction, settings }) {
    if (!interaction.guildId || !interaction.guild) {
      await replyError(interaction, "Unavailable", "Guild-only command.");
      return;
    }

    if (!isOwnerUser(interaction)) {
      await interaction.reply({ content: "❌ You do not have permission to use this command.", ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();
    if (sub === "status") {
      await replySuccess(
        interaction,
        "Gambling Status",
        `Gambling is currently **${settings.gamblingEnabled ? "enabled" : "disabled"}** in this server.`
      );
      return;
    }

    const enabled = interaction.options.getBoolean("enabled", true);
    await updateGuildSettings(interaction.guildId, { gamblingEnabled: enabled } as never);

    await replySuccess(
      interaction,
      "Gambling Updated",
      `Gambling commands are now **${enabled ? "enabled" : "disabled"}** in this server.`
    );
  }
};

export default command;
