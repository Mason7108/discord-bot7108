import {
  ActionRowBuilder,
  AuditLogEvent,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildBan,
  type GuildMember,
  type ModalActionRowComponentBuilder,
  type ModalSubmitInteraction,
  type TextChannel,
  type User
} from "discord.js";
import type { Env } from "../config/env.js";
import {
  findBanAppealRecordForAppealGuild,
  inferPermanentBanFromReason,
  recordBan,
  saveAppealReviewMessage,
  setPermanentBanStatus,
  submitAppeal,
  reviewAppeal
} from "../core/services/banAppealService.js";
import { hasRequiredRole } from "../core/services/rolePolicyService.js";
import type { AppealAnswers, AppealStatus, BanAppealRecordShape, BotClient, GuildSettingsShape } from "../core/types.js";
import { errorEmbed, infoEmbed, successEmbed, warningEmbed } from "../utils/embeds.js";
import { logger } from "../utils/logger.js";

const DEFAULT_APPEAL_GUILD_ID = "1490191877960503457";
const BANNED_USER_ROLE_NAME = "Banned User";
const APPEAL_MODAL_ID = "ban_appeal:submit";
const REVIEW_BUTTON_PREFIX = "ban_appeal_review:";

type ReviewButtonAction = "approve" | "deny" | "permanent";

export function getAppealGuildId(env: Env): string {
  return env.APPEAL_GUILD_ID ?? DEFAULT_APPEAL_GUILD_ID;
}

export function getMainGuildId(env: Env, fallbackGuildId?: string): string | undefined {
  return env.MAIN_GUILD_ID ?? fallbackGuildId ?? env.GUILD_ID;
}

export function isAppealGuild(guildId: string | null | undefined, env: Env): boolean {
  return typeof guildId === "string" && guildId === getAppealGuildId(env);
}

export function isAppealModalSubmit(customId: string): boolean {
  return customId === APPEAL_MODAL_ID;
}

export function appealReviewCustomId(action: ReviewButtonAction, userId: string): string {
  return `${REVIEW_BUTTON_PREFIX}${action}:${userId}`;
}

export function isAppealReviewButton(customId: string): boolean {
  return customId.startsWith(REVIEW_BUTTON_PREFIX);
}

export function parseAppealReviewButton(customId: string): { action: ReviewButtonAction; userId: string } | null {
  if (!isAppealReviewButton(customId)) {
    return null;
  }

  const [action, userId] = customId.slice(REVIEW_BUTTON_PREFIX.length).split(":");
  if ((action === "approve" || action === "deny" || action === "permanent") && userId) {
    return { action, userId };
  }

  return null;
}

function truncate(value: string | undefined, max = 1024): string {
  const text = value?.trim() || "Not provided";
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function formatTimestamp(date: Date | undefined, style: "F" | "R" = "F"): string {
  if (!date) {
    return "Not available";
  }

  return `<t:${Math.floor(date.getTime() / 1_000)}:${style}>`;
}

function statusLabel(status: AppealStatus): string {
  return status.replace("_", " ");
}

function buildReviewButtons(userId: string, disabled = false) {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(appealReviewCustomId("approve", userId))
        .setLabel("Approve")
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(appealReviewCustomId("deny", userId))
        .setLabel("Deny")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(appealReviewCustomId("permanent", userId))
        .setLabel("Mark Permanent")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled)
    )
  ];
}

export function buildBanStatusEmbed(record: BanAppealRecordShape): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(record.isPermanentBan ? 0xed4245 : 0x5865f2)
    .setTitle("Ban Appeal Status")
    .addFields(
      { name: "User", value: `${record.userTag ?? record.username ?? "Unknown"} (${record.userId})` },
      { name: "Main Server", value: record.mainGuildId, inline: true },
      { name: "Appeal Server", value: record.appealGuildId, inline: true },
      { name: "Permanent", value: record.isPermanentBan ? "Yes" : "No", inline: true },
      { name: "Appeal Status", value: statusLabel(record.appealStatus), inline: true },
      { name: "Banned At", value: formatTimestamp(record.bannedAt), inline: true },
      { name: "Banned By", value: record.bannedById ? `<@${record.bannedById}> (${record.bannedById})` : "Unknown", inline: true },
      { name: "Ban Reason", value: truncate(record.banReason) }
    )
    .setTimestamp();
}

export function buildAppealReviewEmbed(record: BanAppealRecordShape): EmbedBuilder {
  const answers = record.appealAnswers;
  const embed = new EmbedBuilder()
    .setColor(record.appealStatus === "submitted" ? 0x5865f2 : record.appealStatus === "approved" ? 0x57f287 : 0xed4245)
    .setTitle("Ban Appeal Review")
    .addFields(
      { name: "User ID", value: record.userId, inline: true },
      { name: "Username", value: record.userTag ?? record.username ?? "Unknown", inline: true },
      { name: "Appeal Status", value: statusLabel(record.appealStatus), inline: true },
      { name: "Permanent Ban", value: record.isPermanentBan ? "Yes" : "No", inline: true },
      { name: "Banned At", value: formatTimestamp(record.bannedAt), inline: true },
      { name: "Submitted", value: formatTimestamp(record.appealSubmittedAt), inline: true },
      { name: "Ban Reason", value: truncate(record.banReason) },
      { name: "Why were you banned?", value: truncate(answers?.bannedReason) },
      { name: "Why should we unban you?", value: truncate(answers?.unbanReason) },
      { name: "What will you do differently?", value: truncate(answers?.futureChanges) }
    )
    .setTimestamp();

  if (record.reviewedById || record.reviewReason) {
    embed.addFields(
      { name: "Reviewed By", value: record.reviewedById ? `<@${record.reviewedById}>` : "Unknown", inline: true },
      { name: "Review Reason", value: truncate(record.reviewReason), inline: true }
    );
  }

  return embed;
}

function canManageRole(member: GuildMember, roleId: string): boolean {
  const role = member.guild.roles.cache.get(roleId);
  if (!role || role.id === member.guild.roles.everyone.id) {
    return false;
  }

  return role.position < member.roles.highest.position;
}

function findBannedUserRole(guild: Guild, env: Env): string | null {
  if (env.BANNED_USER_ROLE_ID && guild.roles.cache.has(env.BANNED_USER_ROLE_ID)) {
    return env.BANNED_USER_ROLE_ID;
  }

  const role = guild.roles.cache.find((candidate) => candidate.name.trim().toLowerCase() === BANNED_USER_ROLE_NAME.toLowerCase());
  return role?.id ?? null;
}

async function fetchReviewChannel(client: BotClient, env: Env): Promise<TextChannel | null> {
  if (!env.APPEAL_REVIEW_CHANNEL_ID) {
    return null;
  }

  const channel = await client.channels.fetch(env.APPEAL_REVIEW_CHANNEL_ID).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    return null;
  }

  return channel as TextChannel;
}

async function sendAppealOpsNotice(client: BotClient, env: Env, embed: EmbedBuilder): Promise<void> {
  const reviewChannel = await fetchReviewChannel(client, env);
  if (!reviewChannel) {
    return;
  }

  await reviewChannel.send({ embeds: [embed] }).catch((error) => {
    logger.warn({ err: error, channelId: env.APPEAL_REVIEW_CHANNEL_ID }, "Failed to send appeal ops notice");
  });
}

async function createAppealInvite(client: BotClient, env: Env): Promise<string | null> {
  const appealGuild = await client.guilds.fetch(getAppealGuildId(env)).catch(() => null);
  if (!appealGuild) {
    return null;
  }

  const guild = await appealGuild.fetch().catch(() => null);
  if (!guild) {
    return null;
  }

  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!me) {
    return null;
  }

  const channels = await guild.channels.fetch().catch(() => null);
  if (!channels) {
    return null;
  }

  for (const channel of channels.values()) {
    if (!channel || channel.type !== ChannelType.GuildText || !("createInvite" in channel)) {
      continue;
    }

    const permissions = channel.permissionsFor(me);
    if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.CreateInstantInvite])) {
      continue;
    }

    const invite = await channel.createInvite({
      maxAge: 0,
      maxUses: 0,
      unique: false,
      reason: "Ban appeal server invite"
    });
    return invite.url;
  }

  return null;
}

async function resolveAppealInvite(client: BotClient, env: Env): Promise<string | null> {
  if (env.APPEAL_SERVER_INVITE) {
    return env.APPEAL_SERVER_INVITE;
  }

  return createAppealInvite(client, env);
}

async function fetchBanAuditDetails(ban: GuildBan): Promise<{ bannedById?: string; banReason?: string }> {
  const guild = ban.guild;
  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  const fallbackReason = (ban as unknown as { reason?: string | null }).reason ?? undefined;

  if (!me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
    return { banReason: fallbackReason };
  }

  const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 6 }).catch(() => null);
  const entry = logs?.entries.find((candidate) => {
    const target = candidate.target as User | null;
    return target?.id === ban.user.id && Date.now() - candidate.createdTimestamp < 30_000;
  });

  return {
    bannedById: entry?.executor?.id,
    banReason: entry?.reason ?? fallbackReason
  };
}

async function dmUser(user: User, content: string, context: Record<string, unknown>): Promise<boolean> {
  const sent = await user.send({ content }).catch((error) => {
    logger.warn({ ...context, err: error }, "Could not DM user for ban appeal flow");
    return null;
  });

  return Boolean(sent);
}

export async function handleGuildBanAdd(client: BotClient, ban: GuildBan, env: Env): Promise<void> {
  const mainGuildId = getMainGuildId(env, ban.guild.id);
  const appealGuildId = getAppealGuildId(env);

  if (!mainGuildId || ban.guild.id !== mainGuildId || ban.guild.id === appealGuildId) {
    logger.debug(
      { banGuildId: ban.guild.id, mainGuildId, appealGuildId, userId: ban.user.id },
      "Ignoring guild ban event outside configured main server"
    );
    return;
  }

  const auditDetails = await fetchBanAuditDetails(ban);
  const isPermanentBan = inferPermanentBanFromReason(auditDetails.banReason);
  const record = await recordBan({
    userId: ban.user.id,
    username: ban.user.username,
    userTag: ban.user.tag,
    mainGuildId,
    appealGuildId,
    bannedAt: new Date(),
    bannedById: auditDetails.bannedById,
    banReason: auditDetails.banReason,
    isPermanentBan
  });

  const invite = await resolveAppealInvite(client, env);
  const permanentText = record.isPermanentBan
    ? "\n\nThis ban is marked as permanent. You may join the appeal server to view your status, but the appeal form is locked."
    : "";
  const inviteText = invite
    ? `you may join the appeal server here: ${invite}.`
    : "the appeal server invite is not configured yet. Please contact server staff for appeal access.";

  if (!invite) {
    logger.warn({ mainGuildId, appealGuildId, userId: ban.user.id }, "No appeal server invite is configured or creatable");
    await sendAppealOpsNotice(
      client,
      env,
      new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle("Ban Appeal Invite Missing")
        .setDescription("A user was banned, but bot7108 could not send an appeal-server invite.")
        .addFields(
          { name: "User", value: `${ban.user.tag} (${ban.user.id})` },
          { name: "Main Server", value: `${ban.guild.name} (${mainGuildId})` },
          { name: "Fix", value: "Set `APPEAL_SERVER_INVITE` or give bot7108 Create Instant Invite in the appeal server." }
        )
        .setTimestamp()
    );
  }

  const dmDelivered = await dmUser(
    ban.user,
    `You were banned from ${ban.guild.name}. If you believe this was a mistake, ${inviteText}${permanentText}`,
    { mainGuildId, appealGuildId, userId: ban.user.id }
  );

  if (!dmDelivered) {
    await sendAppealOpsNotice(
      client,
      env,
      new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle("Ban Appeal DM Failed")
        .setDescription("A user was banned, but bot7108 could not DM them. Their DMs may be closed.")
        .addFields(
          { name: "User", value: `${ban.user.tag} (${ban.user.id})` },
          { name: "Main Server", value: `${ban.guild.name} (${mainGuildId})` },
          { name: "Appeal Status", value: statusLabel(record.appealStatus), inline: true },
          { name: "Permanent", value: record.isPermanentBan ? "Yes" : "No", inline: true }
        )
        .setTimestamp()
    );
  }
}

export async function handleAppealServerMemberJoin(member: GuildMember, env: Env): Promise<boolean> {
  if (!isAppealGuild(member.guild.id, env)) {
    return false;
  }

  if (member.user.bot) {
    return true;
  }

  const record = await findBanAppealRecordForAppealGuild(member.guild.id, member.id);
  if (!record) {
    await dmUser(member.user, "No ban record was found for your account.", { appealGuildId: member.guild.id, userId: member.id });
    return true;
  }

  const botMember = member.guild.members.me ?? (await member.guild.members.fetchMe().catch(() => null));
  const roleId = findBannedUserRole(member.guild, env);
  if (botMember && roleId && botMember.permissions.has(PermissionFlagsBits.ManageRoles) && canManageRole(botMember, roleId)) {
    await member.roles.add(roleId, "User has a main-server ban record").catch((error) => {
      logger.warn({ err: error, appealGuildId: member.guild.id, userId: member.id, roleId }, "Failed to assign banned user role");
    });
  }

  const appealMessage = record.isPermanentBan
    ? "Your ban is marked as permanent, so the appeal form is locked."
    : "You may use /appeal in this server to submit one appeal.";

  await dmUser(
    member.user,
    `You are currently banned from the main server. Appeal status: ${statusLabel(record.appealStatus)}.\n${appealMessage}`,
    { appealGuildId: member.guild.id, userId: member.id }
  );

  return true;
}

export async function handleAppealCommand(interaction: ChatInputCommandInteraction, env: Env): Promise<void> {
  if (!interaction.guildId || !isAppealGuild(interaction.guildId, env)) {
    await interaction.reply({ embeds: [errorEmbed("Unavailable", "This command only works in the appeal server.")], ephemeral: true });
    return;
  }

  const record = await findBanAppealRecordForAppealGuild(interaction.guildId, interaction.user.id);
  if (!record) {
    await interaction.reply({ content: "No ban record was found for your account.", ephemeral: true });
    return;
  }

  if (record.isPermanentBan) {
    await interaction.reply({ content: "Your ban is marked as permanent, so the appeal form is locked.", ephemeral: true });
    return;
  }

  if (record.appealStatus !== "not_submitted") {
    await interaction.reply({ content: "You already submitted an appeal.", ephemeral: true });
    return;
  }

  const modal = new ModalBuilder().setCustomId(APPEAL_MODAL_ID).setTitle("Ban Appeal");
  const bannedReasonInput = new TextInputBuilder()
    .setCustomId("bannedReason")
    .setLabel("Why were you banned?")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);
  const unbanReasonInput = new TextInputBuilder()
    .setCustomId("unbanReason")
    .setLabel("Why should we unban you?")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);
  const futureChangesInput = new TextInputBuilder()
    .setCustomId("futureChanges")
    .setLabel("What will you do differently?")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(bannedReasonInput),
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(unbanReasonInput),
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(futureChangesInput)
  );

  await interaction.showModal(modal);
}

export async function handleAppealModalSubmit(interaction: ModalSubmitInteraction, env: Env): Promise<void> {
  if (!interaction.guildId || !isAppealGuild(interaction.guildId, env)) {
    await interaction.reply({ embeds: [errorEmbed("Unavailable", "Appeals can only be submitted in the appeal server.")], ephemeral: true });
    return;
  }

  const record = await findBanAppealRecordForAppealGuild(interaction.guildId, interaction.user.id);
  if (!record) {
    await interaction.reply({ content: "No ban record was found for your account.", ephemeral: true });
    return;
  }

  if (record.isPermanentBan) {
    await interaction.reply({ content: "Your ban is marked as permanent, so the appeal form is locked.", ephemeral: true });
    return;
  }

  if (record.appealStatus !== "not_submitted") {
    await interaction.reply({ content: "You already submitted an appeal.", ephemeral: true });
    return;
  }

  const answers: AppealAnswers = {
    bannedReason: interaction.fields.getTextInputValue("bannedReason").trim(),
    unbanReason: interaction.fields.getTextInputValue("unbanReason").trim(),
    futureChanges: interaction.fields.getTextInputValue("futureChanges").trim()
  };

  const submitted = await submitAppeal(record.mainGuildId, interaction.user.id, answers);
  if (!submitted) {
    await interaction.reply({ content: "You already submitted an appeal.", ephemeral: true });
    return;
  }

  const reviewChannel = await fetchReviewChannel(interaction.client as BotClient, env);
  if (reviewChannel) {
    const reviewMessage = await reviewChannel.send({
      embeds: [buildAppealReviewEmbed(submitted)],
      components: buildReviewButtons(interaction.user.id)
    });
    await saveAppealReviewMessage(submitted.mainGuildId, interaction.user.id, reviewMessage.channel.id, reviewMessage.id);
  } else {
    logger.warn({ appealGuildId: interaction.guildId }, "Appeal submitted but APPEAL_REVIEW_CHANNEL_ID is not configured or valid");
  }

  await interaction.reply({
    embeds: [successEmbed("Appeal Submitted", "Your appeal was submitted to staff for review.")],
    ephemeral: true
  });
}

function canReviewAppeals(interaction: ButtonInteraction, settings: GuildSettingsShape): boolean {
  const member = interaction.member as GuildMember | null;
  if (!member) {
    return false;
  }

  return member.permissions.has(PermissionFlagsBits.ModerateMembers) || hasRequiredRole(member, settings, "Moderator");
}

async function notifyReviewResult(client: BotClient, userId: string, status: "approved" | "denied" | "locked", reason: string) {
  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) {
    return;
  }

  const statusText =
    status === "approved"
      ? "approved. Staff still needs to manually unban you from the main server."
      : status === "denied"
        ? "denied."
        : "locked because your ban was marked permanent.";

  await dmUser(user, `Your ban appeal was ${statusText}\nReason: ${reason}`, { userId, appealStatus: status });
}

export async function handleAppealReviewButton(interaction: ButtonInteraction, env: Env, settings: GuildSettingsShape): Promise<void> {
  if (!interaction.guildId || !isAppealGuild(interaction.guildId, env)) {
    await interaction.reply({ embeds: [errorEmbed("Unavailable", "Appeal review buttons only work in the appeal server.")], ephemeral: true });
    return;
  }

  if (!canReviewAppeals(interaction, settings)) {
    await interaction.reply({ embeds: [errorEmbed("Permission Denied", "Only appeal staff can review appeals.")], ephemeral: true });
    return;
  }

  const parsed = parseAppealReviewButton(interaction.customId);
  if (!parsed) {
    await interaction.reply({ embeds: [errorEmbed("Invalid Review", "This appeal review button is invalid.")], ephemeral: true });
    return;
  }

  const record = await findBanAppealRecordForAppealGuild(interaction.guildId, parsed.userId);
  if (!record) {
    await interaction.reply({ embeds: [errorEmbed("Not Found", "No ban record was found for that user.")], ephemeral: true });
    return;
  }

  let updated: BanAppealRecordShape | null = null;
  let resultReason = "";
  let dmStatus: "approved" | "denied" | "locked";

  if (parsed.action === "permanent") {
    resultReason = `Marked permanent by ${interaction.user.tag}.`;
    updated = await setPermanentBanStatus(record.mainGuildId, record.userId, true, interaction.user.id, resultReason);
    dmStatus = "locked";
  } else {
    const status = parsed.action === "approve" ? "approved" : "denied";
    resultReason = `${status === "approved" ? "Approved" : "Denied"} from the staff review button.`;
    updated = await reviewAppeal({
      mainGuildId: record.mainGuildId,
      userId: record.userId,
      status,
      reviewedById: interaction.user.id,
      reviewReason: resultReason
    });
    dmStatus = status;
  }

  if (!updated) {
    await interaction.reply({ embeds: [warningEmbed("Already Reviewed", "This appeal is not waiting for review anymore.")], ephemeral: true });
    return;
  }

  await notifyReviewResult(interaction.client as BotClient, record.userId, dmStatus, resultReason);
  await interaction.update({
    embeds: [buildAppealReviewEmbed(updated)],
    components: buildReviewButtons(record.userId, true)
  });
}

export async function sendAppealReviewNotice(
  client: BotClient,
  record: BanAppealRecordShape,
  status: "approved" | "denied",
  reason: string
): Promise<void> {
  await notifyReviewResult(client, record.userId, status, reason);
}

export function appealStatusEmbed(record: BanAppealRecordShape): EmbedBuilder {
  const embed = buildBanStatusEmbed(record);
  if (record.appealText) {
    embed.addFields({ name: "Appeal Text", value: truncate(record.appealText) });
  }
  return embed;
}

export function appealCommandInfoEmbed(): EmbedBuilder {
  return infoEmbed("Ban Appeal", "Use /appeal in the appeal server to open your private appeal form.");
}
