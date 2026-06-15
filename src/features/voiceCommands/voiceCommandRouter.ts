import {
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type GuildTextBasedChannel,
  type InteractionReplyOptions,
  type Message,
  type MessageEditOptions,
  type MessageCreateOptions
} from "discord.js";
import { loadEnv } from "../../config/env.js";
import { checkAndSetCooldown } from "../../core/guards/cooldownGuard.js";
import { isModuleEnabled } from "../../core/guards/moduleGuard.js";
import { hasPermissionForCommand } from "../../core/guards/permissionGuard.js";
import { getActiveCommandRestriction } from "../../core/services/commandRestrictionService.js";
import { getGuildSettings } from "../../core/services/guildSettingsService.js";
import { hasAcceptedTerms, TERMS_REQUIRED_MESSAGE } from "../../core/services/termsAgreementService.js";
import type { BotClient, GuildSettingsShape } from "../../core/types.js";
import { errorEmbed, warningEmbed } from "../../utils/embeds.js";
import { logger } from "../../utils/logger.js";
import { msToHuman } from "../../utils/time.js";

const WAKE_PHRASE = "hey bot7108";
const VOICE_COMMAND_NAMES = new Set(["play", "pause", "resume", "skip", "stop", "leave"]);

export const VOICE_COMMAND_PRIVACY_NOTICE =
  "Voice commands are disabled by default. When enabled, bot7108 processes short voice snippets only while it is in a voice channel to detect commands that start with `hey bot7108`; raw audio is not stored.";

export type VoiceCommandName = "play" | "pause" | "resume" | "skip" | "stop" | "leave";

export type ParsedVoiceCommand =
  | { ok: true; commandName: VoiceCommandName; query?: string; commandText: string }
  | { ok: false; reason: "missing_wake_phrase" | "missing_query" | "unknown_command"; commandText?: string };

export interface VoiceCommandAudioEligibility {
  ok: boolean;
  settings?: GuildSettingsShape;
}

export interface RouteVoiceCommandInput {
  client: BotClient;
  guild: Guild;
  member: GuildMember;
  transcript: string;
  settings?: GuildSettingsShape;
  textChannel?: GuildTextBasedChannel;
}

function normalizeVoiceCommandText(input: string): string {
  return input
    .toLowerCase()
    .replace(/\bbot\s+7108\b/g, "bot7108")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseVoiceCommandTranscript(transcript: string): ParsedVoiceCommand {
  const normalized = normalizeVoiceCommandText(transcript);

  if (!normalized.startsWith(WAKE_PHRASE)) {
    return { ok: false, reason: "missing_wake_phrase" };
  }

  const commandText = normalized.slice(WAKE_PHRASE.length).trim();
  if (!commandText) {
    return { ok: false, reason: "unknown_command", commandText };
  }

  if (commandText === "play") {
    return { ok: false, reason: "missing_query", commandText };
  }

  if (commandText.startsWith("play ")) {
    const query = commandText.slice("play ".length).trim();
    if (!query) {
      return { ok: false, reason: "missing_query", commandText };
    }

    return { ok: true, commandName: "play", query, commandText };
  }

  const commandName = commandText.split(" ", 1)[0] as VoiceCommandName;
  if (!VOICE_COMMAND_NAMES.has(commandName) || commandName === "play") {
    return { ok: false, reason: "unknown_command", commandText };
  }

  return { ok: true, commandName, commandText };
}

function resolveTimeoutUntil(member: GuildMember): Date | null {
  if (member.communicationDisabledUntil instanceof Date && member.communicationDisabledUntil.getTime() > Date.now()) {
    return member.communicationDisabledUntil;
  }

  if (typeof member.communicationDisabledUntilTimestamp === "number" && member.communicationDisabledUntilTimestamp > Date.now()) {
    return new Date(member.communicationDisabledUntilTimestamp);
  }

  return null;
}

function formatDiscordTimestamp(date: Date, style: "F" | "R"): string {
  return `<t:${Math.floor(date.getTime() / 1_000)}:${style}>`;
}

function isProtectedCommandUser(member: GuildMember, guild: Guild): boolean {
  const botOwnerId = loadEnv().BOT_OWNER_ID?.trim();
  return member.id === botOwnerId || member.id === guild.ownerId;
}

async function sendVoiceCommandMessage(
  textChannel: GuildTextBasedChannel,
  member: GuildMember,
  embed: EmbedBuilder
): Promise<void> {
  await textChannel
    .send({
      content: `${member.toString()}`,
      embeds: [embed],
      allowedMentions: { users: [member.id], roles: [] }
    })
    .catch((error: unknown) => {
      logger.warn({ err: error, guildId: member.guild.id, channelId: textChannel.id }, "Failed to send voice command response");
    });
}

export async function resolveVoiceCommandTextChannel(
  guild: Guild,
  settings: GuildSettingsShape
): Promise<GuildTextBasedChannel | null> {
  const configuredChannelId = settings.voiceCommands.textChannelId;
  const configuredChannel = configuredChannelId ? await guild.channels.fetch(configuredChannelId).catch(() => null) : null;
  const channel = configuredChannel ?? guild.systemChannel;

  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    return null;
  }

  const botMember = guild.members.me;
  const permissions = botMember ? channel.permissionsFor(botMember) : null;
  if (!permissions?.has(PermissionFlagsBits.SendMessages)) {
    return null;
  }

  return channel as GuildTextBasedChannel;
}

export async function isVoiceCommandAudioEligible(input: {
  guild: Guild;
  member: GuildMember;
  settings?: GuildSettingsShape;
}): Promise<VoiceCommandAudioEligibility> {
  const settings = input.settings ?? (await getGuildSettings(input.guild.id));

  if (!settings.voiceCommands.enabled || input.member.user.bot) {
    return { ok: false, settings };
  }

  const botVoiceChannelId = input.guild.members.me?.voice.channelId;
  if (!botVoiceChannelId || input.member.voice.channelId !== botVoiceChannelId) {
    return { ok: false, settings };
  }

  if (!isProtectedCommandUser(input.member, input.guild)) {
    const timeoutUntil = resolveTimeoutUntil(input.member);
    if (timeoutUntil) {
      return { ok: false, settings };
    }

    const restricted = await getActiveCommandRestriction(input.guild.id, input.member.id).catch((error: unknown) => {
      logger.error({ err: error, guildId: input.guild.id, userId: input.member.id }, "Failed to check voice command restriction");
      return true;
    });

    if (restricted) {
      return { ok: false, settings };
    }

    const acceptedTerms = await hasAcceptedTerms(input.guild.id, input.member.id).catch((error: unknown) => {
      logger.error({ err: error, guildId: input.guild.id, userId: input.member.id }, "Failed to check voice command terms");
      return false;
    });

    if (!acceptedTerms) {
      return { ok: false, settings };
    }
  }

  return { ok: true, settings };
}

function toMessagePayload(payload: string | InteractionReplyOptions): string | MessageCreateOptions {
  if (typeof payload === "string") {
    return payload;
  }

  const { ephemeral: _ephemeral, flags: _flags, ...messagePayload } = payload as InteractionReplyOptions & {
    flags?: unknown;
  };

  return messagePayload as MessageCreateOptions;
}

function createVoiceInteraction(input: {
  guild: Guild;
  member: GuildMember;
  textChannel: GuildTextBasedChannel;
  commandName: VoiceCommandName;
  query?: string;
}): ChatInputCommandInteraction {
  let responseMessage: Message | null = null;

  const send = async (payload: string | InteractionReplyOptions, edit: boolean): Promise<Message | null> => {
    const messagePayload = toMessagePayload(payload);

    if (edit && responseMessage?.editable && typeof messagePayload !== "string") {
      responseMessage = await responseMessage.edit(messagePayload as MessageEditOptions);
      return responseMessage;
    }

    responseMessage = await input.textChannel.send(messagePayload);
    return responseMessage;
  };

  const adapter = {
    commandName: input.commandName,
    guildId: input.guild.id,
    guild: input.guild,
    member: input.member,
    user: input.member.user,
    channel: input.textChannel,
    deferred: false,
    replied: false,
    options: {
      getString(name: string, required?: boolean) {
        if (name === "query" && input.query) {
          return input.query;
        }

        if (required) {
          throw new Error(`Missing voice command option: ${name}`);
        }

        return null;
      }
    },
    async deferReply() {
      adapter.deferred = true;
    },
    async editReply(payload: string | InteractionReplyOptions) {
      adapter.replied = true;
      return send(payload, true);
    },
    async reply(payload: string | InteractionReplyOptions) {
      adapter.replied = true;
      return send(payload, false);
    },
    async followUp(payload: string | InteractionReplyOptions) {
      return send(payload, false);
    }
  };

  return adapter as unknown as ChatInputCommandInteraction;
}

async function denyVoiceCommand(input: RouteVoiceCommandInput, textChannel: GuildTextBasedChannel, description: string): Promise<void> {
  await sendVoiceCommandMessage(textChannel, input.member, warningEmbed("Voice Command Blocked", description));
}

export async function routeVoiceCommandTranscript(input: RouteVoiceCommandInput): Promise<void> {
  const parsed = parseVoiceCommandTranscript(input.transcript);
  if (!parsed.ok && parsed.reason === "missing_wake_phrase") {
    return;
  }

  const settings = input.settings ?? (await getGuildSettings(input.guild.id));
  if (!settings.voiceCommands.enabled) {
    return;
  }

  const textChannel = input.textChannel ?? (await resolveVoiceCommandTextChannel(input.guild, settings));
  if (!textChannel) {
    logger.warn({ guildId: input.guild.id }, "Detected voice command but no usable text channel is configured");
    return;
  }

  if (!parsed.ok) {
    const description =
      parsed.reason === "missing_query"
        ? "Say `hey bot7108 play` followed by a song name."
        : "I heard `hey bot7108`, but I did not recognize that music command.";
    await sendVoiceCommandMessage(textChannel, input.member, warningEmbed("Voice Command Not Recognized", description));
    return;
  }

  const eligibility = await isVoiceCommandAudioEligible({ guild: input.guild, member: input.member, settings });
  if (!eligibility.ok) {
    return;
  }

  if (!isProtectedCommandUser(input.member, input.guild)) {
    const timeoutUntil = resolveTimeoutUntil(input.member);
    if (timeoutUntil) {
      await denyVoiceCommand(
        input,
        textChannel,
        `You cannot use bot7108 commands while timed out. Your timeout ends ${formatDiscordTimestamp(
          timeoutUntil,
          "F"
        )} (${formatDiscordTimestamp(timeoutUntil, "R")}).`
      );
      return;
    }

    const restricted = await getActiveCommandRestriction(input.guild.id, input.member.id).catch((error: unknown) => {
      logger.error({ err: error, guildId: input.guild.id, userId: input.member.id }, "Failed to check voice command restriction");
      return null;
    });

    if (restricted) {
      await denyVoiceCommand(input, textChannel, `Your access to bot7108 commands is disabled. Reason: ${restricted.reason}`);
      return;
    }

    const acceptedTerms = await hasAcceptedTerms(input.guild.id, input.member.id).catch((error: unknown) => {
      logger.error({ err: error, guildId: input.guild.id, userId: input.member.id }, "Failed to check voice command terms");
      return false;
    });

    if (!acceptedTerms) {
      await denyVoiceCommand(input, textChannel, TERMS_REQUIRED_MESSAGE);
      return;
    }
  }

  const command = input.client.commands.get(parsed.commandName);
  if (!command) {
    await sendVoiceCommandMessage(
      textChannel,
      input.member,
      errorEmbed("Voice Command Unavailable", `The \`${parsed.commandName}\` music command is not loaded.`)
    );
    return;
  }

  if (!isModuleEnabled(command, settings)) {
    await denyVoiceCommand(input, textChannel, `The **${command.module}** module is disabled on this server.`);
    return;
  }

  const permissionCheck = hasPermissionForCommand(command, input.member, settings, input.guild.members.me);
  if (!permissionCheck.ok) {
    await denyVoiceCommand(input, textChannel, permissionCheck.reason);
    return;
  }

  const env = loadEnv();
  const cooldownSec = Math.max(command.cooldownSec ?? 0, env.VOICE_COMMANDS_COOLDOWN_SEC);
  const cooldown = checkAndSetCooldown(input.client.cooldowns, `voice:${parsed.commandName}`, input.member.id, cooldownSec);
  if (!cooldown.ok) {
    await denyVoiceCommand(input, textChannel, `Try again in ${msToHuman(cooldown.msRemaining)}.`);
    return;
  }

  logger.info(
    {
      guildId: input.guild.id,
      userId: input.member.id,
      command: parsed.commandName,
      query: parsed.query
    },
    "Detected voice command"
  );

  const interaction = createVoiceInteraction({
    guild: input.guild,
    member: input.member,
    textChannel,
    commandName: parsed.commandName,
    query: parsed.query
  });

  try {
    await command.execute({ client: input.client, interaction, settings });
  } catch (error) {
    logger.error({ err: error, guildId: input.guild.id, command: parsed.commandName }, "Voice command execution failed");
    await sendVoiceCommandMessage(
      textChannel,
      input.member,
      errorEmbed("Voice Command Error", "An unexpected error occurred while executing that voice command.")
    );
  }
}
