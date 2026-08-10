import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  type GuildBasedChannel,
  type GuildTextBasedChannel,
  type Message
} from "discord.js";
import type { Express } from "express";
import type { Env } from "../config/env.js";
import type { BotClient } from "../core/types.js";
import {
  TERMS_CONTACT_EMAIL,
  TERMS_COPYRIGHT_NOTICE,
  TERMS_USE_NOTICE,
  TERMS_VERSION
} from "../core/services/termsAgreementService.js";
import { loadTermsAgreementMessageState, saveTermsAgreementMessageState } from "../utils/termsAgreementMessageManager.js";
import { logger } from "../utils/logger.js";

const AGREEMENT_MESSAGE_TITLE = "bot7108 Terms of Service & Privacy Policy";
const AGREEMENT_BUTTON_LABEL = "Review TOS & Privacy Policy";
const LEGACY_AGREEMENT_BUTTON_LABEL = "Agree to TOS & Privacy Policy";

interface LegalSection {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
}

const TERMS_SECTIONS: LegalSection[] = [
  {
    title: "1. About bot7108",
    paragraphs: ["bot7108 is a Discord bot created to provide server tools and entertainment features, which may include:"],
    bullets: [
      "Moderation commands",
      "Logging tools",
      "Utility commands",
      "Economy and leveling systems",
      "Giveaways and raffle systems",
      "Tickets and support tools",
      "Verification features",
      "Google CAPTCHA verification",
      "Voice chat time tracking",
      "Roblox-related verification or activity features",
      "Fun, AI, and community commands",
      "Server configuration features"
    ]
  },
  {
    title: "2. Who Can Use bot7108",
    paragraphs: [
      "You must be allowed to use Discord under Discord's own rules.",
      "Server owners and administrators are responsible for making sure bot7108 is used properly in their servers."
    ]
  },
  {
    title: "3. Server Owner and Admin Responsibility",
    paragraphs: ["If you invite bot7108 to a server, you confirm that you have permission to do so.", "Server owners and admins are responsible for:"],
    bullets: [
      "Setting up bot permissions correctly",
      "Choosing which features are enabled",
      "Informing server members if bot7108 logs moderation, messages, activity, verification, or economy data",
      "Making sure their server follows Discord's rules",
      "Removing bot7108 if they no longer want it in their server"
    ]
  },
  {
    title: "4. Prohibited Use",
    paragraphs: ["bot7108 should not be used to harass, spam, threaten, impersonate, scam, or harm other users.", "You may not use bot7108 to:"],
    bullets: [
      "Break Discord's Terms of Service, Community Guidelines, Developer Terms, or Developer Policy",
      "Spam users, channels, servers, or Discord's API",
      "Harass, threaten, bully, or target people",
      "Collect private information without permission",
      "Bypass Discord permissions, bans, security systems, or verification systems",
      "Run real-money gambling, betting, paid raffles, or illegal prize systems",
      "Abuse moderation, logging, verification, or economy features",
      "Exploit bugs or attempt to crash bot7108",
      "Reverse engineer, steal, or copy bot7108's code without permission",
      "Upload, share, or expose bot tokens, API keys, database URLs, secrets, or private credentials"
    ]
  },
  {
    title: "5. Moderation and Logging Features",
    paragraphs: [
      "bot7108 may include moderation and logging tools such as warnings, timeouts, bans, kicks, purge commands, mod logs, join/leave logs, message logs, verification logs, and other server safety tools.",
      "These features are controlled by the server's staff. bot7108 and its owner are not responsible for how server staff choose to use moderation tools."
    ]
  },
  {
    title: "6. Economy, Leveling, Raffles, and Giveaways",
    paragraphs: [
      "bot7108 may include virtual economy features such as balances, daily rewards, work commands, shop systems, inventory, leaderboards, coinflip, virtual gambling-style commands, raffles, giveaways, and leveling.",
      "These features are for fun only. Virtual bot currency has no cash value and cannot be exchanged for real money through bot7108.",
      "The economy, gambling-style, raffle, and giveaway features of bot7108 are intended for virtual Discord entertainment only. They may not be used with real money, cryptocurrency, gift cards, paid entries, or anything with real-world financial value.",
      "bot7108 may store user IDs, balances, XP, levels, inventory data, raffle entries, giveaway entries, voice chat time, and other related stats to make these features work."
    ]
  },
  {
    title: "7. Verification Features",
    paragraphs: [
      "bot7108 may include verification systems, such as Discord role verification, Google CAPTCHA verification, Roblox verification, buttons, temporary tokens, verification pages, and logs.",
      "Verification is used to help servers protect themselves from spam, bots, raids, or unverified users.",
      "Users may not attempt to bypass, abuse, attack, or interfere with the verification system."
    ]
  },
  {
    title: "8. Third-Party Services",
    paragraphs: ["bot7108 may use third-party services to operate, including:"],
    bullets: [
      "Discord, because bot7108 runs through Discord's API",
      "Railway, for hosting and deployment",
      "GitHub, for code storage, version control, and development",
      "Google, for CAPTCHA verification",
      "Roblox-related services, if Roblox verification is enabled"
    ]
  },
  {
    title: "9. Availability",
    paragraphs: [
      "bot7108 may not always be online. The bot may go offline because of updates, hosting issues, bugs, Discord API issues, database problems, third-party service issues, or maintenance.",
      "There is no guarantee that bot7108 will always be available, error-free, or supported forever."
    ]
  },
  {
    title: "10. Bot Changes",
    paragraphs: ["bot7108 may be updated at any time. Features may be changed, removed, renamed, limited, or added without notice."]
  },
  {
    title: "11. Termination of Access",
    paragraphs: ["Access to bot7108 may be limited, blocked, or removed if:"],
    bullets: [
      "A user abuses the bot",
      "A server violates these Terms",
      "A server violates Discord's rules",
      "A feature is being used in a harmful way",
      "The bot owner decides to stop supporting a server or user"
    ]
  },
  {
    title: "12. No Warranty",
    paragraphs: [
      "bot7108 is provided as is. There is no guarantee that the bot will work perfectly, save all data correctly, prevent all raids, stop all rule-breaking, or protect a server from every issue.",
      "Use bot7108 at your own risk."
    ]
  },
  {
    title: "13. Limitation of Liability",
    paragraphs: ["To the maximum extent allowed by law, bot7108 and its creator are not responsible for:"],
    bullets: [
      "Lost server data",
      "Incorrect moderation actions",
      "Lost economy progress",
      "Database errors",
      "Bot downtime",
      "Permission setup mistakes",
      "Server staff misuse",
      "Discord outages",
      "Railway outages",
      "GitHub issues",
      "Google CAPTCHA issues",
      "Roblox-related service issues",
      "Third-party service issues",
      "Any damages caused by using or being unable to use bot7108"
    ]
  },
  {
    title: "14. Copyright and Trademark Notice",
    paragraphs: [
      "Copyright © 2026 by Mason7108 Apps. All Rights Reserved.",
      "bot7108™ is a trademark of Mason7108 Apps.",
      "All original bot features, branding, text, logos, commands, designs, website content, and related materials created for bot7108 are owned by Mason7108 Apps unless otherwise stated.",
      "Discord, GitHub, Railway, Google, Roblox, and any other third-party names, logos, trademarks, or services mentioned are the property of their respective owners. bot7108 is not affiliated with, sponsored by, or endorsed by those companies unless clearly stated."
    ]
  },
  {
    title: "15. Contact",
    paragraphs: [`For questions, support, data requests, or removal requests, contact Mason Abdullaj / Mason7108 at ${TERMS_CONTACT_EMAIL}.`]
  },
  {
    title: "16. Updates to These Terms",
    paragraphs: ["These Terms may be updated in the future. Continued use of bot7108 after changes means you accept the updated Terms."]
  }
];

const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: "1. Information bot7108 May Collect",
    paragraphs: ["Depending on which features are enabled in a server, bot7108 may collect and store some of the following information:"],
    bullets: [
      "Discord user IDs, server IDs, channel IDs, role IDs, message IDs, usernames or display names, server names, role names, and command usage",
      "Warnings, timeout records, ban or kick records, moderator actions, reason logs, deleted or edited message logs, and join or leave logs if enabled",
      "Virtual currency balances, XP, levels, inventory items, shop purchases, daily reward claims, work command usage, virtual game results, and leaderboard stats",
      "Giveaway entries, raffle entries, winner records, duplicate entry prevention data, eligibility checks, and voice chat time or activity requirements if enabled",
      "Verification status, temporary verification tokens, Google CAPTCHA verification result, verified and unverified role status, verification logs, and Roblox username or Roblox user ID if Roblox verification is enabled",
      "Voice channel activity time, voice channel join and leave timestamps, and voice time stats for raffles, leveling, or activity requirements",
      "Ticket creator ID, ticket channel ID, ticket messages or transcripts if enabled, staff responses, and ticket open and close times"
    ]
  },
  {
    title: "2. Information bot7108 Does Not Intentionally Collect",
    paragraphs: ["bot7108 does not intentionally collect:"],
    bullets: [
      "Real names unless a user puts one in Discord",
      "Home addresses",
      "Phone numbers",
      "Payment card information",
      "Passwords",
      "Private Discord login information",
      "Discord account tokens",
      "Real-money banking information"
    ]
  },
  {
    title: "3. Why bot7108 Collects Data",
    paragraphs: ["bot7108 collects data only to make its features work, including:"],
    bullets: [
      "Running moderation commands and keeping moderation logs",
      "Saving economy balances, XP, levels, and leaderboards",
      "Running raffles and giveaways and preventing duplicate entries",
      "Tracking voice chat time",
      "Managing verification and assigning roles",
      "Running tickets",
      "Improving server safety, debugging errors, and preventing abuse of the bot"
    ]
  },
  {
    title: "4. How Data Is Stored",
    paragraphs: [
      "bot7108 may store data in a database.",
      "bot7108 may be hosted and deployed using Railway.",
      "bot7108's code may be stored and managed using GitHub.",
      "Reasonable steps are taken to protect stored data, such as keeping bot tokens private, using environment variables, limiting database access, and not publicly exposing private credentials. However, no system is 100% secure."
    ]
  },
  {
    title: "5. Who Can See the Data",
    paragraphs: ["Some bot data may be visible to:"],
    bullets: [
      "The bot owner",
      "Server owners",
      "Server administrators",
      "Server moderators",
      "Users with permission to use bot logs, moderation commands, economy commands, ticket commands, dashboards, or leaderboard commands"
    ]
  },
  {
    title: "6. Data Sharing and Third-Party Services",
    paragraphs: ["bot7108 does not sell user data.", "bot7108 may share or process limited data through third-party services only when needed for the bot to work, including:"],
    bullets: [
      "Discord, because bot7108 runs through Discord's API",
      "Railway, for hosting, deployment, and server operation",
      "GitHub, for code storage, version control, and development",
      "Google, for CAPTCHA verification if CAPTCHA is enabled",
      "Roblox-related services, if Roblox verification is enabled"
    ]
  },
  {
    title: "7. Message Content",
    paragraphs: [
      "bot7108 may process message content only if needed for enabled features, such as moderation, logging, commands, filters, tickets, or server safety tools.",
      "If message logging is enabled, server staff should inform members that logs may be active."
    ]
  },
  {
    title: "8. Data Retention",
    paragraphs: ["bot7108 keeps data only as long as needed for bot features, server configuration, moderation history, economy systems, verification systems, tickets, raffles, abuse prevention, or debugging.", "Some data may remain until:"],
    bullets: [
      "A user requests deletion",
      "A server owner requests deletion",
      "The bot is removed from a server",
      "The data is manually cleared",
      "The feature is reset",
      "The bot owner deletes old data"
    ]
  },
  {
    title: "9. Data Deletion Requests",
    paragraphs: [
      `Users or server owners may request deletion of data connected to their Discord user ID or server ID by contacting Mason Abdullaj / Mason7108 at ${TERMS_CONTACT_EMAIL}.`,
      "When requesting deletion, include your Discord user ID, the server ID if the request is server-related, and what data you want deleted.",
      "Some data may not be deleted immediately if it is needed for security, moderation history, abuse prevention, or legal reasons."
    ]
  },
  {
    title: "10. Children and Teen Users",
    paragraphs: [
      "bot7108 is designed for Discord users who are allowed to use Discord under Discord's own rules.",
      "bot7108 is not meant to collect sensitive personal information from children or teens. Users should avoid sharing private personal information with the bot."
    ]
  },
  {
    title: "11. Security",
    paragraphs: ["The bot owner tries to protect bot7108 using reasonable security steps, such as:"],
    bullets: [
      "Keeping the Discord bot token private",
      "Storing secrets in environment variables",
      "Using Railway environment variables for private keys and tokens",
      "Avoiding uploading .env files or secrets to GitHub",
      "Limiting database access",
      "Using Discord permissions",
      "Using role-based staff commands",
      "Avoiding unnecessary data collection"
    ]
  },
  {
    title: "12. Server Settings and Responsibility",
    paragraphs: [
      "Server owners control many bot settings. They are responsible for deciding which features are enabled in their servers.",
      "If a server enables logging, moderation tracking, verification, tickets, raffles, economy features, or activity tracking, server staff should make sure members understand how those features are used."
    ]
  },
  {
    title: "13. Copyright and Trademark Notice",
    paragraphs: [
      "Copyright © 2026 by Mason7108 Apps. All Rights Reserved.",
      "bot7108™ is a trademark of Mason7108 Apps.",
      "All original bot features, branding, text, logos, commands, designs, website content, and related materials created for bot7108 are owned by Mason7108 Apps unless otherwise stated.",
      "Discord, GitHub, Railway, Google, Roblox, and any other third-party names, logos, trademarks, or services mentioned are the property of their respective owners. bot7108 is not affiliated with, sponsored by, or endorsed by those companies unless clearly stated."
    ]
  },
  {
    title: "14. Updates to This Privacy Policy",
    paragraphs: [
      "This Privacy Policy may be updated when bot7108 changes, adds new features, removes features, changes hosting, changes databases, or changes how data is stored.",
      "Continued use of bot7108 after changes means you accept the updated Privacy Policy."
    ]
  },
  {
    title: "Short Version for a Discord Channel",
    paragraphs: [
      `By using bot7108, you agree to its Terms of Service and Privacy Policy. bot7108 may store Discord IDs, server IDs, command usage, moderation logs, economy stats, XP, raffle entries, giveaway entries, verification status, voice chat time, ticket data, and Roblox verification info depending on enabled features. bot7108 uses Railway for hosting, GitHub for code management, and Google CAPTCHA for CAPTCHA verification. bot7108 does not sell user data. Virtual economy and gambling-style features are for fun only and have no real-money value. To request data deletion, contact Mason7108 at ${TERMS_CONTACT_EMAIL}.`,
      TERMS_COPYRIGHT_NOTICE
    ]
  }
];

function isGuildTextChannel(channel: GuildBasedChannel | null): channel is GuildTextBasedChannel {
  return Boolean(channel && channel.isTextBased() && "messages" in channel);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildTermsUrl(env: Env): string | null {
  if (!env.BASE_URL) {
    return null;
  }

  return new URL("/terms", env.BASE_URL).toString();
}

function renderSections(sections: LegalSection[]): string {
  return sections
    .map((section) => {
      const paragraphs = section.paragraphs?.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n") ?? "";
      const bullets =
        section.bullets && section.bullets.length > 0
          ? `<ul>${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>`
          : "";

      return `<section class="legal-section">
        <h3>${escapeHtml(section.title)}</h3>
        ${paragraphs}
        ${bullets}
      </section>`;
    })
    .join("\n");
}

function renderShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7fb;
      --ink: #172033;
      --muted: #5f6b7a;
      --line: #d7dce5;
      --accent: #2559d6;
      --accent-hover: #1f4ab4;
      --surface: #ffffff;
      --success: #176b3a;
      --danger: #b42318;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: Arial, Helvetica, sans-serif;
      line-height: 1.6;
    }
    a { color: var(--accent); }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 2;
      border-bottom: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.96);
    }
    .topbar-inner {
      width: min(1040px, 100%);
      margin: 0 auto;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .brand {
      font-weight: 700;
      font-size: 1rem;
      white-space: nowrap;
    }
    nav {
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
      justify-content: flex-end;
      font-size: 0.92rem;
    }
    .shell {
      width: min(1040px, 100%);
      margin: 0 auto;
      padding: 32px 20px 48px;
    }
    .hero {
      padding: 10px 0 24px;
      border-bottom: 1px solid var(--line);
      margin-bottom: 24px;
    }
    h1 {
      font-size: clamp(2rem, 5vw, 3.2rem);
      line-height: 1.1;
      margin: 0 0 12px;
      letter-spacing: 0;
    }
    h2 {
      font-size: 1.45rem;
      margin: 34px 0 8px;
      letter-spacing: 0;
    }
    h3 {
      font-size: 1.05rem;
      margin: 22px 0 8px;
      letter-spacing: 0;
    }
    p {
      margin: 0 0 10px;
      color: var(--muted);
    }
    ul {
      margin: 8px 0 14px 20px;
      padding: 0;
      color: var(--muted);
    }
    li { margin: 3px 0; }
    .document {
      background: var(--surface);
      border: 1px solid var(--line);
      padding: 22px;
      margin-top: 18px;
    }
    .legal-section + .legal-section {
      border-top: 1px solid #edf0f5;
      margin-top: 16px;
      padding-top: 4px;
    }
    .agreement {
      margin-top: 28px;
      background: var(--surface);
      border: 2px solid var(--accent);
      padding: 22px;
    }
    .notice {
      font-weight: 600;
      color: var(--ink);
    }
    .session {
      color: var(--ink);
      font-weight: 600;
    }
    .error { color: var(--danger); }
    .success { color: var(--success); }
    .button,
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      border: 0;
      background: var(--accent);
      color: #ffffff;
      font-weight: 700;
      text-decoration: none;
      padding: 10px 16px;
      cursor: pointer;
      width: 100%;
      max-width: 360px;
      font-size: 1rem;
    }
    .button:hover,
    button:hover {
      background: var(--accent-hover);
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      color: var(--muted);
      font-size: 0.94rem;
    }
    footer {
      border-top: 1px solid var(--line);
      margin-top: 32px;
      padding-top: 18px;
      color: var(--muted);
      font-size: 0.92rem;
    }
    @media (max-width: 620px) {
      .topbar-inner {
        align-items: flex-start;
        flex-direction: column;
      }
      nav {
        justify-content: flex-start;
      }
      .document,
      .agreement {
        padding: 16px;
      }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <div class="brand">bot7108</div>
      <nav aria-label="Legal document links">
        <a href="#terms-of-service">Terms</a>
        <a href="#privacy-policy">Privacy</a>
        <a href="#agreement">Agreement</a>
      </nav>
    </div>
  </header>
  <main class="shell">
    ${body}
    <footer>${escapeHtml(TERMS_COPYRIGHT_NOTICE)}</footer>
  </main>
</body>
</html>`;
}

function renderLegalPage(): string {
  return renderShell(
    "bot7108 Terms of Service and Privacy Policy",
    `<section class="hero">
      <h1>bot7108 Terms of Service and Privacy Policy</h1>
      <p>Last Updated: August 9, 2026</p>
      <div class="meta">
        <span>Terms Version: ${escapeHtml(TERMS_VERSION)}</span>
        <span>Contact: ${escapeHtml(TERMS_CONTACT_EMAIL)}</span>
      </div>
    </section>

    <section id="terms-of-service" class="document">
      <h2>bot7108 Terms of Service</h2>
      <p>Welcome to bot7108. These Terms of Service explain the rules for using bot7108 in Discord servers.</p>
      <p>By inviting, using, or interacting with bot7108, you agree to follow these Terms, Discord's Terms of Service, Discord's Community Guidelines, Discord's Developer Terms, Discord's Developer Policy, and any rules set by the server where bot7108 is used.</p>
      ${renderSections(TERMS_SECTIONS)}
    </section>

    <section id="privacy-policy" class="document">
      <h2>bot7108 Privacy Policy</h2>
      <p>This Privacy Policy explains what information bot7108 may collect, why it is collected, how it is used, and how users or server owners can request deletion.</p>
      <p>Discord's Developer Policy expects developers to follow rules for operating Discord applications, and Discord's Privacy Policy explains how Discord handles information through its own services.</p>
      ${renderSections(PRIVACY_SECTIONS)}
    </section>

    <section id="agreement" class="agreement">
      <h2>Agreement</h2>
      <p>${escapeHtml(TERMS_USE_NOTICE)}</p>
      <p class="notice">${escapeHtml(TERMS_COPYRIGHT_NOTICE)}</p>
    </section>`
  );
}

function agreementEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x2559d6)
    .setTitle(AGREEMENT_MESSAGE_TITLE)
    .setDescription(
      `${TERMS_USE_NOTICE}\n\nUse the button below to review the current policies.`
    )
    .setFooter({ text: TERMS_COPYRIGHT_NOTICE })
    .setTimestamp();
}

function agreementButtonRow(url: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(AGREEMENT_BUTTON_LABEL).setURL(url)
  );
}

function isStoredAgreementMessage(message: Message, botUserId: string): boolean {
  if (message.author.id !== botUserId) {
    return false;
  }

  const hasExpectedTitle = message.embeds.some((embed) => embed.title === AGREEMENT_MESSAGE_TITLE);
  const hasLinkButton = message.components.some((row) => {
    if (!("components" in row)) {
      return false;
    }

    return row.components.some(
      (component) =>
        component.type === ComponentType.Button &&
        "label" in component &&
        (component.label === AGREEMENT_BUTTON_LABEL || component.label === LEGACY_AGREEMENT_BUTTON_LABEL)
    );
  });

  return hasExpectedTitle && hasLinkButton;
}

export async function ensureTermsAgreementMessage(client: BotClient, env: Env): Promise<void> {
  if (!env.AGREEMENT_CHANNEL_ID) {
    logger.warn("Terms agreement setup skipped: AGREEMENT_CHANNEL_ID is not configured");
    return;
  }

  if (!env.BASE_URL) {
    logger.warn("Terms agreement setup skipped: BASE_URL is not configured");
    return;
  }

  const channel = await client.channels.fetch(env.AGREEMENT_CHANNEL_ID).catch(() => null);
  if (!channel || !("guildId" in channel) || !isGuildTextChannel(channel)) {
    logger.warn({ agreementChannelId: env.AGREEMENT_CHANNEL_ID }, "Terms agreement setup skipped: channel not found or not text-based");
    return;
  }

  const botUserId = client.user?.id;
  if (!botUserId) {
    return;
  }

  const termsUrl = buildTermsUrl(env);
  if (!termsUrl) {
    return;
  }

  const payload = {
    embeds: [agreementEmbed()],
    components: [agreementButtonRow(termsUrl)]
  };

  const stored = await loadTermsAgreementMessageState();
  if (stored && stored.guildId === channel.guildId && stored.channelId === channel.id) {
    const existing = await channel.messages.fetch(stored.messageId).catch(() => null);
    if (existing && isStoredAgreementMessage(existing, botUserId)) {
      await existing.edit(payload);
      logger.info({ channelId: channel.id, messageId: existing.id }, "Updated terms agreement message");
      return;
    }
  }

  const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  const discovered = recent?.find((message) => isStoredAgreementMessage(message, botUserId)) ?? null;
  if (discovered) {
    await discovered.edit(payload);
    await saveTermsAgreementMessageState({
      guildId: channel.guildId,
      channelId: channel.id,
      messageId: discovered.id
    });
    logger.info({ channelId: channel.id, messageId: discovered.id }, "Reused terms agreement message");
    return;
  }

  const sent = await channel.send(payload);
  await saveTermsAgreementMessageState({
    guildId: channel.guildId,
    channelId: channel.id,
    messageId: sent.id
  });

  logger.info({ channelId: channel.id, messageId: sent.id }, "Created terms agreement message");
}

export function registerTermsAgreementRoutes(app: Express): void {
  app.get(["/terms", "/privacy", "/tos"], (_req, res) => {
    res.status(200).type("html").send(renderLegalPage());
  });

  app.get(["/auth/discord", "/auth/discord/callback"], (_req, res) => {
    res.redirect(302, "/terms#agreement");
  });

  app.post("/terms/agree", (_req, res) => {
    res.redirect(303, "/terms#agreement");
  });
}
