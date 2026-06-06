import { EmbedBuilder, type GuildMember } from "discord.js";
import { loadEnv } from "../config/env.js";
import type { EventDefinition } from "../core/types.js";
import { checkAndSetCooldown } from "../core/guards/cooldownGuard.js";
import { isModuleEnabled } from "../core/guards/moduleGuard.js";
import { hasPermissionForCommand } from "../core/guards/permissionGuard.js";
import { getActiveCommandRestriction } from "../core/services/commandRestrictionService.js";
import { getGuildSettings } from "../core/services/guildSettingsService.js";
import { hasAcceptedTerms, TERMS_REQUIRED_MESSAGE } from "../core/services/termsAgreementService.js";
import { handleGiveawayJoin } from "../systems/giveaways.js";
import { handleInviteGeneratorButton, isInviteGeneratorButton } from "../systems/inviteGenerator.js";
import {
  handleTicketActionButton,
  handleTicketCloseReasonModal,
  handleTicketCreateButton,
  isTicketActionButton,
  isTicketCloseReasonModal,
  TICKET_CREATE_BUTTON_ID
} from "../systems/tickets.js";
import { handleVerificationButton, isVerificationButton } from "../systems/verification.js";
import { handleSplitVcButton, isSplitVcButton } from "../systems/vcTeamRandomizer.js";
import { errorEmbed, warningEmbed } from "../utils/embeds.js";
import { logger } from "../utils/logger.js";
import { msToHuman } from "../utils/time.js";

const env = loadEnv();

function isProtectedCommandUser(interaction: any): boolean {
  const userId = typeof interaction.user?.id === "string" ? interaction.user.id : undefined;
  const botOwnerId = env.BOT_OWNER_ID?.trim();

  if (!userId) {
    return false;
  }

  return userId === botOwnerId || userId === interaction.guild?.ownerId;
}

function formatDiscordTimestamp(date: Date, style: "F" | "R"): string {
  return `<t:${Math.floor(date.getTime() / 1_000)}:${style}>`;
}

function resolveTimeoutUntil(member: any): Date | null {
  if (member?.communicationDisabledUntil instanceof Date && member.communicationDisabledUntil.getTime() > Date.now()) {
    return member.communicationDisabledUntil;
  }

  if (typeof member?.communicationDisabledUntilTimestamp === "number" && member.communicationDisabledUntilTimestamp > Date.now()) {
    return new Date(member.communicationDisabledUntilTimestamp);
  }

  if (typeof member?.communication_disabled_until === "string") {
    const parsed = new Date(member.communication_disabled_until);
    return parsed.getTime() > Date.now() ? parsed : null;
  }

  return null;
}

async function denyCommandAccess(interaction: any, description: string): Promise<void> {
  if (interaction.isAutocomplete?.()) {
    await interaction.respond([]).catch((error: unknown) => {
      logger.warn({ err: error }, "Failed to deny restricted autocomplete");
    });
    return;
  }

  const payload = { embeds: [warningEmbed("Commands Disabled", description)], ephemeral: true };

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
}

async function ensureCommandAccess(interaction: any): Promise<boolean> {
  const guildId = typeof interaction.guildId === "string" ? interaction.guildId : undefined;
  const userId = typeof interaction.user?.id === "string" ? interaction.user.id : undefined;

  if (!guildId || !userId || isProtectedCommandUser(interaction)) {
    return true;
  }

  const timeoutUntil = resolveTimeoutUntil(interaction.member);

  if (timeoutUntil) {
    await denyCommandAccess(
      interaction,
      `You cannot use bot7108 commands while you are timed out. Your timeout ends ${formatDiscordTimestamp(
        timeoutUntil,
        "F"
      )} (${formatDiscordTimestamp(timeoutUntil, "R")}).`
    );
    return false;
  }

  let restriction: Awaited<ReturnType<typeof getActiveCommandRestriction>>;
  try {
    restriction = await getActiveCommandRestriction(guildId, userId);
  } catch (error) {
    logger.error({ err: error, guildId, userId }, "Failed to check command restriction");
    await denyCommandAccess(interaction, "I could not verify your bot7108 command access. Try again later.");
    return false;
  }

  if (!restriction) {
    return true;
  }

  const until = restriction.expiresAt
    ? `Restriction ends ${formatDiscordTimestamp(restriction.expiresAt, "F")} (${formatDiscordTimestamp(restriction.expiresAt, "R")}).`
    : "An admin must remove this restriction.";

  await denyCommandAccess(interaction, `Your access to bot7108 commands is disabled. ${until}\nReason: ${restriction.reason}`);
  return false;
}

async function ensureTermsAccepted(interaction: any): Promise<boolean> {
  const guildId = typeof interaction.guildId === "string" ? interaction.guildId : undefined;
  const userId = typeof interaction.user?.id === "string" ? interaction.user.id : undefined;

  if (!guildId || !userId) {
    return true;
  }

  const accepted = await hasAcceptedTerms(guildId, userId).catch((error) => {
    logger.error({ err: error, guildId, userId }, "Failed to check terms agreement");
    return false;
  });

  if (accepted) {
    return true;
  }

  if (interaction.isAutocomplete?.()) {
    await interaction.respond([]).catch((error: unknown) => {
      logger.warn({ err: error, guildId, userId }, "Failed to deny autocomplete before terms agreement");
    });
    return false;
  }

  const payload = { content: TERMS_REQUIRED_MESSAGE, ephemeral: true };
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload).catch((error: unknown) => {
      logger.warn({ err: error, guildId, userId }, "Failed to send terms agreement follow-up");
    });
    return false;
  }

  await interaction.reply(payload).catch((error: unknown) => {
    logger.warn({ err: error, guildId, userId }, "Failed to send terms agreement reply");
  });
  return false;
}

const event: EventDefinition = {
  name: "interactionCreate",
  async execute(client, rawInteraction) {
    if (!rawInteraction || typeof rawInteraction !== "object") {
      return;
    }

    const interaction = rawInteraction as any;

    if (interaction.isAutocomplete()) {
      if (!(await ensureTermsAccepted(interaction))) {
        return;
      }

      if (!(await ensureCommandAccess(interaction))) {
        return;
      }

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

      if (!(await ensureTermsAccepted(interaction))) {
        return;
      }

      if (isVerificationButton(interaction.customId)) {
        await handleVerificationButton(interaction, env);
        return;
      }

      if (isInviteGeneratorButton(interaction.customId)) {
        await handleInviteGeneratorButton(interaction, env);
        return;
      }

      const settings = await getGuildSettings(interaction.guildId);

      if (interaction.customId === TICKET_CREATE_BUTTON_ID) {
        await handleTicketCreateButton(interaction, settings);
        return;
      }

      if (isTicketActionButton(interaction.customId)) {
        await handleTicketActionButton(interaction, settings);
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

    if (interaction.isModalSubmit()) {
      if (!interaction.guildId) {
        await interaction.reply({ content: "This interaction only works in servers.", ephemeral: true });
        return;
      }

      if (!(await ensureTermsAccepted(interaction))) {
        return;
      }

      if (isTicketCloseReasonModal(interaction.customId)) {
        const settings = await getGuildSettings(interaction.guildId);
        await handleTicketCloseReasonModal(interaction, settings);
      }

      return;
    }

    if (interaction.isAnySelectMenu?.()) {
      await ensureTermsAccepted(interaction);
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

    if (!(await ensureTermsAccepted(interaction))) {
      return;
    }

    if (!(await ensureCommandAccess(interaction))) {
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
