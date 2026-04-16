import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  PermissionFlagsBits,
  type ButtonInteraction,
  type Guild,
  type GuildBasedChannel,
  type GuildTextBasedChannel,
  type Message,
  type Role
} from "discord.js";
import type { Env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import {
  consumeVerificationSession,
  createVerificationSession,
  inspectVerificationSession,
  takeVerificationButtonRateLimit
} from "../utils/tokenManager.js";
import { loadVerifyMessageState, saveVerifyMessageState } from "../utils/verifyMessageManager.js";
import { msToHuman } from "../utils/time.js";
import type { BotClient as ProjectBotClient } from "../core/types.js";

export const VERIFY_BUTTON_ID = "verification:open";

const VERIFICATION_TITLE = "Server Verification";
const VERIFICATION_DESCRIPTION = "Click the button below to verify and gain access to the server.";

type CaptchaProvider = "recaptcha" | "hcaptcha";

interface CaptchaConfig {
  provider: CaptchaProvider;
  siteKey: string;
  secret: string;
}

function verificationEmbed(): EmbedBuilder {
  return new EmbedBuilder().setColor(0x5865f2).setTitle(VERIFICATION_TITLE).setDescription(VERIFICATION_DESCRIPTION).setTimestamp();
}

function verificationButtonRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(VERIFY_BUTTON_ID).setLabel("Verify").setStyle(ButtonStyle.Success)
  );
}

function isGuildTextChannel(channel: GuildBasedChannel | null): channel is GuildTextBasedChannel {
  return Boolean(channel && channel.isTextBased() && "messages" in channel);
}

function isStoredVerificationMessage(message: Message, botUserId: string): boolean {
  if (message.author.id !== botUserId) {
    return false;
  }

  const hasExpectedTitle = message.embeds.some((embed) => embed.title === VERIFICATION_TITLE);
  const hasButton = message.components.some((row) => {
    if (!("components" in row)) {
      return false;
    }

    return row.components.some(
      (component) => component.type === ComponentType.Button && "customId" in component && component.customId === VERIFY_BUTTON_ID
    );
  });

  return hasExpectedTitle && hasButton;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function resolveCaptchaConfig(env: Env): CaptchaConfig | null {
  if (env.RECAPTCHA_SITE_KEY && env.RECAPTCHA_SECRET_KEY) {
    return {
      provider: "recaptcha",
      siteKey: env.RECAPTCHA_SITE_KEY,
      secret: env.RECAPTCHA_SECRET_KEY
    };
  }

  if (env.HCAPTCHA_SITEKEY && env.HCAPTCHA_SECRET) {
    return {
      provider: "hcaptcha",
      siteKey: env.HCAPTCHA_SITEKEY,
      secret: env.HCAPTCHA_SECRET
    };
  }

  return null;
}

function renderPage(title: string, description: string, innerHtml = "", captchaScriptUrl?: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0f1117;
      --panel: #161a22;
      --accent: #4f8cff;
      --text: #f2f4ff;
      --muted: #b3bbd1;
      --ok: #57f287;
      --error: #ed4245;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", Tahoma, sans-serif;
      background: radial-gradient(circle at top, #1b2130, var(--bg));
      color: var(--text);
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .card {
      width: min(520px, 100%);
      background: var(--panel);
      border: 1px solid #2a3346;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
    }
    h1 {
      margin: 0 0 10px;
      font-size: 1.6rem;
    }
    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.5;
    }
    .ok { color: var(--ok); }
    .error { color: var(--error); }
    .spacer { height: 18px; }
    button {
      margin-top: 16px;
      width: 100%;
      border: 0;
      border-radius: 10px;
      background: var(--accent);
      color: white;
      font-weight: 600;
      font-size: 1rem;
      padding: 12px 14px;
      cursor: pointer;
    }
    button:hover { filter: brightness(1.08); }
  </style>
  ${captchaScriptUrl ? `<script src="${escapeHtml(captchaScriptUrl)}" async defer></script>` : ""}
</head>
<body>
  <main class="card">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(description)}</p>
    <div class="spacer"></div>
    ${innerHtml}
  </main>
</body>
</html>`;
}

function findRole(guild: Guild, roleId: string | undefined, roleName: string): Role | null {
  if (roleId) {
    return guild.roles.cache.get(roleId) ?? null;
  }

  const normalized = roleName.trim().toLowerCase();
  return guild.roles.cache.find((role) => role.name.trim().toLowerCase() === normalized) ?? null;
}

async function postVerificationLog(
  guild: Guild,
  env: Env,
  payload: {
    userTag: string;
    userId: string;
  }
): Promise<void> {
  if (!env.LOG_CHANNEL_ID) {
    return;
  }

  const channel = await guild.channels.fetch(env.LOG_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("Verification Successful")
    .addFields(
      { name: "User", value: payload.userTag, inline: true },
      { name: "User ID", value: payload.userId, inline: true },
      { name: "Timestamp", value: `<t:${Math.floor(Date.now() / 1_000)}:F>` }
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => null);
}

async function verifyCaptcha(input: {
  config: CaptchaConfig;
  responseToken: string;
  remoteIp?: string;
}): Promise<boolean> {
  const body = new URLSearchParams({
    secret: input.config.secret,
    response: input.responseToken
  });

  if (input.remoteIp) {
    body.set("remoteip", input.remoteIp);
  }

  const verifyUrl =
    input.config.provider === "recaptcha"
      ? "https://www.google.com/recaptcha/api/siteverify"
      : "https://hcaptcha.com/siteverify";

  const verifyResponse = await fetch(verifyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!verifyResponse.ok) {
    return false;
  }

  const json = (await verifyResponse.json()) as { success?: boolean };
  return json.success === true;
}

export function isVerificationButton(customId: string): boolean {
  return customId === VERIFY_BUTTON_ID;
}

export async function ensureVerificationMessage(client: ProjectBotClient, env: Env): Promise<void> {
  if (!env.VERIFY_CHANNEL_ID) {
    logger.warn("Verification setup skipped: VERIFY_CHANNEL_ID is not configured");
    return;
  }

  const channel = await client.channels.fetch(env.VERIFY_CHANNEL_ID).catch(() => null);
  if (!channel || !("guildId" in channel) || !isGuildTextChannel(channel)) {
    logger.warn({ verifyChannelId: env.VERIFY_CHANNEL_ID }, "Verification setup skipped: verify channel not found or not text-based");
    return;
  }

  const guildId = channel.guildId;
  const botUserId = client.user?.id;
  if (!botUserId) {
    return;
  }

  const stored = await loadVerifyMessageState();
  if (stored && stored.guildId === guildId && stored.channelId === channel.id) {
    const existing = await channel.messages.fetch(stored.messageId).catch(() => null);
    if (existing && isStoredVerificationMessage(existing, botUserId)) {
      logger.info({ channelId: channel.id, messageId: existing.id }, "Verification message already exists");
      return;
    }
  }

  const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  const discovered = recent?.find((message) => isStoredVerificationMessage(message, botUserId)) ?? null;
  if (discovered) {
    await saveVerifyMessageState({
      guildId,
      channelId: channel.id,
      messageId: discovered.id
    });

    logger.info({ channelId: channel.id, messageId: discovered.id }, "Reused existing verification message");
    return;
  }

  const sent = await channel.send({
    embeds: [verificationEmbed()],
    components: [verificationButtonRow()]
  });

  await saveVerifyMessageState({
    guildId,
    channelId: channel.id,
    messageId: sent.id
  });

  logger.info({ channelId: channel.id, messageId: sent.id }, "Created verification message");
}

export async function handleVerificationButton(interaction: ButtonInteraction, env: Env): Promise<void> {
  if (interaction.user.bot) {
    await interaction.reply({ content: "Bots cannot use verification.", ephemeral: true });
    return;
  }

  if (!interaction.guild || !interaction.guildId) {
    await interaction.reply({ content: "This button only works inside a server.", ephemeral: true });
    return;
  }

  if (!env.BASE_URL) {
    await interaction.reply({ content: "Verification is not configured yet. Please contact a server admin.", ephemeral: true });
    return;
  }

  const verifiedRole = findRole(interaction.guild, env.VERIFIED_ROLE_ID, env.VERIFIED_ROLE_NAME);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: "Could not find your member profile in this server.", ephemeral: true });
    return;
  }

  if (verifiedRole && member.roles.cache.has(verifiedRole.id)) {
    await interaction.reply({ content: "You are already verified.", ephemeral: true });
    return;
  }

  const buttonCooldownMs = env.VERIFY_BUTTON_COOLDOWN_SEC * 1_000;
  const cooldown = takeVerificationButtonRateLimit(interaction.guildId, interaction.user.id, buttonCooldownMs);
  if (!cooldown.ok) {
    await interaction.reply({
      content: `Please wait ${msToHuman(cooldown.msRemaining)} before requesting another verification link.`,
      ephemeral: true
    });
    return;
  }

  const session = createVerificationSession({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    ttlMs: env.VERIFY_TOKEN_TTL_SEC * 1_000
  });

  const verifyUrl = new URL("/verify", env.BASE_URL);
  verifyUrl.searchParams.set("userId", interaction.user.id);
  verifyUrl.searchParams.set("token", session.token);

  await interaction.reply({
    content: `Open this link to verify:\n${verifyUrl.toString()}\n\nThis link expires in **${Math.floor(env.VERIFY_TOKEN_TTL_SEC / 60)} minutes** and can only be used once.`,
    ephemeral: true
  });
}

export function buildVerifyPage(env: Env, userId?: string, token?: string): { status: number; html: string } {
  if (!userId || !token) {
    return {
      status: 400,
      html: renderPage("Invalid Verification Link", "Missing verification parameters. Go back to Discord and click Verify again.")
    };
  }

  const session = inspectVerificationSession({ userId, token });
  if (!session.ok) {
    return {
      status: 400,
      html: renderPage("Verification Link Expired", "This verification link is invalid or expired. Please return to Discord and click Verify again.")
    };
  }

  const captchaConfig = resolveCaptchaConfig(env);
  if (!captchaConfig) {
    return {
      status: 500,
      html: renderPage(
        "Verification Unavailable",
        "CAPTCHA is not configured yet. Set RECAPTCHA_SITE_KEY and RECAPTCHA_SECRET_KEY."
      )
    };
  }

  const widgetClass = captchaConfig.provider === "recaptcha" ? "g-recaptcha" : "h-captcha";
  const scriptUrl =
    captchaConfig.provider === "recaptcha" ? "https://www.google.com/recaptcha/api.js" : "https://js.hcaptcha.com/1/api.js";

  return {
    status: 200,
    html: renderPage(
      "Complete Verification",
      "Finish the CAPTCHA below to verify your account.",
      `<form method="POST" action="/verify">
        <input type="hidden" name="userId" value="${escapeHtml(userId)}" />
        <input type="hidden" name="token" value="${escapeHtml(token)}" />
        <div class="${widgetClass}" data-sitekey="${escapeHtml(captchaConfig.siteKey)}"></div>
        <button type="submit">Submit Verification</button>
      </form>`,
      scriptUrl
    )
  };
}

export async function completeVerification(input: {
  env: Env;
  client: ProjectBotClient;
  userId: string;
  token: string;
  captchaResponse?: string;
  remoteIp?: string;
}): Promise<{ status: number; html: string }> {
  const { env, client } = input;

  if (!input.userId || !input.token) {
    return {
      status: 400,
      html: renderPage("Invalid Request", "Missing verification parameters. Return to Discord and try again.")
    };
  }

  const precheck = inspectVerificationSession({ userId: input.userId, token: input.token });
  if (!precheck.ok) {
    return {
      status: 400,
      html: renderPage("Verification Link Expired", "This verification link is invalid or expired. Please click Verify again in Discord.")
    };
  }

  const captchaConfig = resolveCaptchaConfig(env);
  if (!input.captchaResponse || !captchaConfig) {
    return {
      status: 400,
      html: renderPage("CAPTCHA Required", "Complete the CAPTCHA before submitting.")
    };
  }

  const captchaOk = await verifyCaptcha({
    config: captchaConfig,
    responseToken: input.captchaResponse,
    remoteIp: input.remoteIp
  }).catch(() => false);

  if (!captchaOk) {
    return {
      status: 400,
      html: renderPage("CAPTCHA Failed", "CAPTCHA verification failed. Please go back and try again.")
    };
  }

  const consumed = consumeVerificationSession({ userId: input.userId, token: input.token });
  if (!consumed.ok) {
    return {
      status: 400,
      html: renderPage("Verification Link Expired", "This verification link was already used or expired. Click Verify in Discord again.")
    };
  }

  const guild = await client.guilds.fetch(consumed.session.guildId).catch(() => null);
  if (!guild) {
    return {
      status: 500,
      html: renderPage("Verification Failed", "Could not find the server for this verification session.")
    };
  }

  const member = await guild.members.fetch(consumed.session.userId).catch(() => null);
  if (!member || member.user.bot) {
    return {
      status: 400,
      html: renderPage("Verification Failed", "Could not verify this account in the server.")
    };
  }

  const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return {
      status: 500,
      html: renderPage("Verification Failed", "Bot is missing Manage Roles permission.")
    };
  }

  const verifiedRole = findRole(guild, env.VERIFIED_ROLE_ID, env.VERIFIED_ROLE_NAME);
  if (!verifiedRole) {
    return {
      status: 500,
      html: renderPage("Verification Failed", "Verified role was not found. Ask an admin to check role configuration.")
    };
  }

  if (verifiedRole.position >= botMember.roles.highest.position) {
    return {
      status: 500,
      html: renderPage("Verification Failed", "Verified role is above the bot role in role hierarchy.")
    };
  }

  await member.roles.add(verifiedRole.id, "CAPTCHA verification completed");

  const unverifiedRole = findRole(guild, env.UNVERIFIED_ROLE_ID, env.UNVERIFIED_ROLE_NAME);
  if (unverifiedRole && member.roles.cache.has(unverifiedRole.id) && unverifiedRole.position < botMember.roles.highest.position) {
    await member.roles.remove(unverifiedRole.id, "User completed CAPTCHA verification").catch(() => null);
  }

  await postVerificationLog(guild, env, {
    userTag: member.user.tag,
    userId: member.id
  });

  logger.info({ guildId: guild.id, userId: member.id }, "User verified through CAPTCHA");

  return {
    status: 200,
    html: renderPage("Verification Complete", "Verification successful! You can return to Discord.")
  };
}
