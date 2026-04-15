import { EmbedBuilder, type GuildMember } from "discord.js";
import { loadEnv } from "../config/env.js";
import type { EventDefinition } from "../core/types.js";
import { checkAndSetCooldown } from "../core/guards/cooldownGuard.js";
import { isModuleEnabled } from "../core/guards/moduleGuard.js";
import { hasPermissionForCommand } from "../core/guards/permissionGuard.js";
import { getGuildSettings } from "../core/services/guildSettingsService.js";
import { handleGiveawayJoin } from "../systems/giveaways.js";
import { handleTicketCreateButton, TICKET_CREATE_BUTTON_ID } from "../systems/tickets.js";
import { handleVerificationButton, isVerificationButton } from "../systems/verification.js";
import { handleSplitVcButton, isSplitVcButton } from "../systems/vcTeamRandomizer.js";
import { errorEmbed, warningEmbed } from "../utils/embeds.js";
import { logger } from "../utils/logger.js";
import { msToHuman } from "../utils/time.js";

const env = loadEnv();

const event: EventDefinition = {
  name: "interactionCreate",
  async execute(client, rawInteraction) {
    if (!rawInteraction || typeof rawInteraction !== "object") {
      return;
    }

    const interaction = rawInteraction as any;

    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (command?.autocomplete) {
        await command.autocomplete(interaction);
      }
      return;
    }

    if (interaction.isButton()) {
      if (!interaction.guildId) {
        await interaction.reply({ content: "This interaction only works in servers.", ephemeral: true });
        return;
      }

      if (isVerificationButton(interaction.customId)) {
        await handleVerificationButton(interaction, env);
        return;
      }

      const settings = await getGuildSettings(interaction.guildId);

      if (interaction.customId === TICKET_CREATE_BUTTON_ID) {
        await handleTicketCreateButton(interaction, settings);
        return;
      }

      if (interaction.customId.startsWith("giveaway_join:")) {
        await handleGiveawayJoin(interaction);
        return;
      }

      if (isSplitVcButton(interaction.customId)) {
        await handleSplitVcButton(interaction);
      }

      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      return;
    }

    if (!interaction.guildId || !interaction.guild || !interaction.member) {
      await interaction.reply({ embeds: [errorEmbed("Unavailable", "Commands can only be used inside a guild.")], ephemeral: true });
      return;
    }

    const settings = await getGuildSettings(interaction.guildId);

    if (!isModuleEnabled(command, settings) && interaction.commandName !== "modules") {
      await interaction.reply({
        embeds: [warningEmbed("Module Disabled", `The **${command.module}** module is disabled on this server.`)],
        ephemeral: true
      });
      return;
    }

    const member = interaction.member as GuildMember;
    const botMember = interaction.guild.members.me;
    const permissionCheck = hasPermissionForCommand(command, member, settings, botMember);

    if (!permissionCheck.ok) {
      if (permissionCheck.code === "user" || permissionCheck.code === "role") {
        await interaction.reply({ content: "? You do not have permission to use this command.", ephemeral: true });
        return;
      }

      await interaction.reply({ embeds: [errorEmbed("Permission Denied", permissionCheck.reason)], ephemeral: true });
      return;
    }

    const cooldown = checkAndSetCooldown(client.cooldowns, interaction.commandName, interaction.user.id, command.cooldownSec ?? 0);
    if (!cooldown.ok) {
      await interaction.reply({
        embeds: [warningEmbed("Cooldown", `Try again in ${msToHuman(cooldown.msRemaining)}.`)],
        ephemeral: true
      });
      return;
    }

    try {
      await command.execute({ client, interaction, settings });
    } catch (error) {
      logger.error({ err: error, command: interaction.commandName }, "Command execution failed");

      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("Command Error")
        .setDescription("An unexpected error occurred while executing this command.")
        .setTimestamp();

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ embeds: [embed], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
  }
};

export default event;
