const app = document.querySelector("#app");
const toastRegion = document.querySelector(".toast-region");
const navLinks = document.querySelector("[data-nav-links]");
const navToggle = document.querySelector(".nav-toggle");

const state = {
  me: null,
  config: null,
  status: null,
  commands: [],
  guilds: [],
  guildId: null,
  guildData: null,
  ownerData: null,
  csrfToken: null
};

const dashboardSections = [
  ["overview", "Overview"],
  ["moderation", "Moderation"],
  ["automod", "Automod"],
  ["welcome", "Welcome"],
  ["logging", "Logging"],
  ["commands", "Commands"],
  ["music", "Music"],
  ["reaction-roles", "Reaction Roles"],
  ["tickets", "Tickets"],
  ["suggestions", "Suggestions"],
  ["custom-commands", "Custom Commands"],
  ["server-statistics", "Server Statistics"],
  ["audit-log", "Audit Log"],
  ["settings", "Settings"]
];

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function routePath() {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

function navigate(path) {
  window.history.pushState({}, "", path);
  render();
}

function toast(message, type = "success") {
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.textContent = message;
  toastRegion.append(node);
  setTimeout(() => node.remove(), 4200);
}

function setLoading(label = "Loading") {
  app.innerHTML = `
    <section class="loading-shell" aria-label="${escapeHtml(label)}">
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-line"></div>
      <div class="skeleton-grid">
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-card"></div>
      </div>
    </section>`;
}

async function api(path, options = {}) {
  const multipart = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers = {
    Accept: "application/json",
    ...(options.body && !multipart ? { "Content-Type": "application/json" } : {}),
    ...(options.csrf ? { "X-CSRF-Token": state.csrfToken || "" } : {})
  };
  const response = await fetch(path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({ ok: false, error: "Invalid server response." }));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

async function loadBootstrap() {
  const [config, me, status, commands] = await Promise.all([
    api("/api/public/config"),
    api("/api/auth/me"),
    api("/api/public/status"),
    api("/api/public/commands")
  ]);
  state.config = config;
  state.me = me.authenticated ? me.user : null;
  state.csrfToken = me.csrfToken || null;
  state.status = status;
  state.commands = commands.commands || [];
}

function footer() {
  return `
    <footer class="footer">
      <span>Copyright &copy; 2026 Mason7108 Apps. All Rights Reserved.</span>
      <span>
        <a href="/terms-of-service" data-link>Terms</a>
        <a href="/privacy-policy" data-link>Privacy</a>
        <a href="/acceptable-use" data-link>Acceptable Use</a>
        <a href="/support" data-link>Support</a>
      </span>
    </footer>`;
}

function statusBadge(ok, textOk = "Online", textBad = "Offline") {
  return `<span class="badge ${ok ? "ok" : "soon"}">${ok ? textOk : textBad}</span>`;
}

function homePage() {
  const stats = state.status?.stats || {};
  return `
    <section class="section hero">
      <div>
        <span class="eyebrow">Discord server management</span>
        <h1>bot7108</h1>
        <p class="lead">The all-in-one bot for moderation, music, utilities, and server management.</p>
        <div class="button-row">
          <a class="button primary" href="${escapeHtml(state.config?.inviteUrl || "#")}">Add to Discord</a>
          <a class="button secondary" href="/dashboard" data-link>Open Dashboard</a>
        </div>
        <div class="stats-strip" style="margin-top: 34px">
          ${metric("Servers", stats.servers ?? "Unavailable")}
          ${metric("Users", stats.users ?? "Unavailable")}
          ${metric("Commands", stats.commands ?? state.commands.length)}
        </div>
      </div>
      <div class="hero-visual" aria-label="Dashboard preview">
        ${dashboardPreview()}
      </div>
    </section>
    <section class="section tight">
      <div class="page-heading">
        <span class="eyebrow">Core modules</span>
        <h2>Built for servers that need control without clutter.</h2>
      </div>
      <div class="feature-grid four">
        ${featureCard("Moderation", "Warn, timeout, kick, ban, purge, lock, and review cases with Discord permission checks.", "Available")}
        ${featureCard("Music", "DisTube-powered playback controls with queue, volume, skip, pause, resume, and 24/7 mode.", "Available")}
        ${featureCard("Automod", "Spam, invite links, blocked words, links, caps, and anti-raid spike detection.", "Available")}
        ${featureCard("Tickets", "Ticket buttons, claims, close reasons, and optional transcripts.", "Available")}
      </div>
    </section>
    <section class="section tight">
      <div class="page-heading">
        <span class="eyebrow">Status</span>
        <h2>Current service health.</h2>
      </div>
      <div class="status-grid">
        ${statusCard("Bot", state.status?.bot?.online, `${state.status?.bot?.latencyMs ?? "Unavailable"} ms latency`)}
        ${statusCard("API", true, "Dashboard API responding")}
        ${statusCard("Database", state.status?.database?.online, state.status?.database?.status || "Unknown")}
      </div>
    </section>
    <section class="section tight">
      <div class="page-heading">
        <span class="eyebrow">FAQ</span>
        <h2>Frequently asked questions.</h2>
      </div>
      <div class="docs-grid">
        ${docCard("What permissions does bot7108 need?", "The bot needs the Discord permissions required by enabled modules. Moderation actions also verify both the manager and bot permissions before running.")}
        ${docCard("Does the dashboard bypass Discord roles?", "No. Server-specific changes are authorized on the server using Discord membership and permissions, not browser-provided values.")}
        ${docCard("Is bot7108 affiliated with Discord or music providers?", "No. Third-party names belong to their respective owners and are not official affiliations with Mason7108 Apps.")}
      </div>
    </section>
    ${footer()}`;
}

function dashboardPreview() {
  return `
    <div class="dashboard-preview">
      <div class="preview-topbar">
        <strong>bot7108 dashboard</strong>
        <div class="preview-dots" aria-hidden="true"><span></span><span></span><span></span></div>
      </div>
      <div class="preview-body">
        <div class="preview-sidebar">
          <div class="preview-tab active"></div>
          <div class="preview-tab"></div>
          <div class="preview-tab"></div>
          <div class="preview-tab"></div>
          <div class="preview-tab"></div>
        </div>
        <div class="preview-main">
          <div class="preview-grid">
            <div class="metric-card"><div class="metric-value">12</div><span class="muted">Enabled modules</span></div>
            <div class="metric-card"><div class="metric-value">42ms</div><span class="muted">Bot latency</span></div>
            <div class="metric-card"><div class="metric-value">8</div><span class="muted">Recent actions</span></div>
            <div class="metric-card"><div class="metric-value">Safe</div><span class="muted">Permission checks</span></div>
          </div>
          <div class="preview-activity panel">
            <strong>Moderation activity</strong>
            <div class="activity-line"></div>
            <div class="activity-line"></div>
            <div class="activity-line"></div>
          </div>
        </div>
      </div>
    </div>`;
}

function metric(label, value) {
  return `<div class="metric-card"><div class="metric-value">${escapeHtml(value)}</div><span class="muted">${escapeHtml(label)}</span></div>`;
}

function featureCard(title, detail, status) {
  const cls = status === "Coming Soon" ? "soon" : status === "Partial" ? "partial" : "ok";
  return `<article class="card"><h3>${escapeHtml(title)} <span class="badge ${cls}">${escapeHtml(status)}</span></h3><p>${escapeHtml(detail)}</p></article>`;
}

function docCard(title, detail) {
  return `<article class="doc-card"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(detail)}</p></article>`;
}

function statusCard(title, ok, detail) {
  return `<article class="status-card"><h3>${escapeHtml(title)} ${statusBadge(Boolean(ok))}</h3><p>${escapeHtml(detail)}</p></article>`;
}

function featuresPage() {
  const cards = (state.config?.features || []).map((feature) => featureCard(feature.category, feature.detail, feature.status)).join("");
  return `
    <section class="section">
      <div class="page-heading">
        <span class="eyebrow">Feature map</span>
        <h1>Features</h1>
        <p class="lead">Only live bot7108 capabilities are marked available. Planned modules are labeled Coming Soon.</p>
      </div>
      <div class="feature-grid">${cards}</div>
    </section>
    ${footer()}`;
}

function commandsPage() {
  return `
    <section class="section">
      <div class="page-heading">
        <span class="eyebrow">Slash command directory</span>
        <h1>Commands</h1>
        <p class="lead">Loaded from the bot project at runtime so descriptions and categories stay aligned with bot7108.</p>
      </div>
      <div class="toolbar">
        <input class="search-input" type="search" placeholder="Search commands" aria-label="Search commands" data-command-search />
        <span class="badge">${state.commands.length} commands</span>
      </div>
      <div class="command-list" data-command-list>${renderCommandRows(state.commands)}</div>
    </section>
    ${footer()}`;
}

function renderCommandRows(commands) {
  if (!commands.length) {
    return `<div class="empty-state">No commands are available yet.</div>`;
  }

  return commands
    .map(
      (command) => `
        <article class="command-row">
          <div>
            <span class="code">${escapeHtml(command.slashFormat)}</span>
            <p class="muted" style="margin: 8px 0 0">${escapeHtml(command.category)}</p>
          </div>
          <div>
            <strong>${escapeHtml(command.name)}</strong>
            <p>${escapeHtml(command.description)}</p>
            <span class="code">${escapeHtml(command.usage)}</span>
          </div>
          <div>
            <span class="badge ${command.enabled ? "ok" : "soon"}">${command.enabled ? "Enabled" : "Disabled"}</span>
            <p class="muted">${escapeHtml((command.requiredPermissions || []).join(", ") || "No special user permission")}</p>
          </div>
        </article>`
    )
    .join("");
}

function statusPage() {
  const updated = state.status?.lastUpdatedAt ? new Date(state.status.lastUpdatedAt).toLocaleString() : "Unavailable";
  return `
    <section class="section">
      <div class="page-heading">
        <span class="eyebrow">Health</span>
        <h1>Status</h1>
        <p class="lead">Public health information without private infrastructure details.</p>
      </div>
      <div class="status-grid">
        ${statusCard("Bot", state.status?.bot?.online, `${state.status?.bot?.latencyMs ?? "Unavailable"} ms bot latency`)}
        ${statusCard("API", state.status?.api?.online, "Dashboard API responding")}
        ${statusCard("Database", state.status?.database?.online, state.status?.database?.status || "Unknown")}
        ${statusCard("Website", state.status?.website?.online, "Static website assets served by the bot API")}
      </div>
      <p class="muted" style="margin-top: 18px">Last status update: ${escapeHtml(updated)}</p>
    </section>
    ${footer()}`;
}

function docsPage() {
  const docs = [
    ["Inviting the bot", "Use Add to Discord, select a server you can manage, and grant permissions for the modules you plan to use."],
    ["Required permissions", "Moderation requires matching Discord permissions for the manager and bot. Music requires voice channel permissions. Tickets require Manage Channels."],
    ["Setting up moderation", "Open the dashboard, select a server, set a moderation log channel, then review enabled moderation commands and role policy."],
    ["Welcome messages", "Enable the welcome module, select a channel, and use safe placeholders: {user}, {username}, {server}, and {memberCount}."],
    ["Configuring logs", "Enable each log category separately and choose channels that bot7108 can view and send messages in."],
    ["Setting up music", "Enable the music module and configure volume, 24/7 mode, queue limits, DJ role, and voice-channel behavior."],
    ["Command permissions", "Use command settings to disable non-essential commands, set cooldowns, and restrict commands to roles or channels."],
    ["Troubleshooting", "Check bot status, bot permissions, role hierarchy, channel access, and Discord rate-limit errors before retrying."]
  ];
  return `
    <section class="section">
      <div class="page-heading">
        <span class="eyebrow">Documentation</span>
        <h1>Documentation</h1>
        <p class="lead">Practical setup notes for bot7108 server managers.</p>
      </div>
      <div class="docs-grid">${docs.map(([title, detail]) => docCard(title, detail)).join("")}</div>
    </section>
    ${footer()}`;
}

function supportPage() {
  return `
    <section class="section">
      <div class="page-heading">
        <span class="eyebrow">Support</span>
        <h1>Support</h1>
        <p class="lead">Send a support request, bug report, or feature request. Forms are rate limited and checked for spam.</p>
        ${
          state.config?.supportServerUrl
            ? `<a class="button secondary" href="${escapeHtml(state.config.supportServerUrl)}">Open support server</a>`
            : `<p class="muted">Support Discord server URL is not configured yet.</p>`
        }
      </div>
      <form class="form-card" data-support-form>
        <input type="hidden" name="startedAt" value="${Date.now()}" />
        <input class="honeypot" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" />
        <div class="form-grid">
          ${field("kind", "Request type", `<select name="kind" required><option value="support">Support</option><option value="bug">Bug report</option><option value="feature">Feature request</option></select>`)}
          ${field("name", "Name", `<input name="name" required maxlength="80" autocomplete="name" />`)}
          ${field("contact", "Contact", `<input name="contact" required maxlength="160" autocomplete="email" />`)}
          ${field("discordUserId", "Discord user ID", `<input name="discordUserId" inputmode="numeric" />`)}
          ${field("guildId", "Server ID", `<input name="guildId" inputmode="numeric" />`)}
          ${field("subject", "Subject", `<input name="subject" required maxlength="120" />`)}
          <div class="field full-span">
            <label for="message">Message</label>
            <textarea id="message" name="message" required maxlength="3000"></textarea>
            <small>Do not send bot tokens, passwords, API keys, or private credentials.</small>
          </div>
        </div>
        <div class="button-row"><button class="button primary" type="submit">Submit</button></div>
      </form>
    </section>
    ${footer()}`;
}

function field(id, label, control) {
  return `<div class="field"><label for="${escapeHtml(id)}">${escapeHtml(label)}</label>${control.replace(`name="${id}"`, `id="${id}" name="${id}"`)}</div>`;
}

function legalPage(kind) {
  const legal = {
    "/terms-of-service": [
      "Terms of Service",
      [
        "bot7108 is provided by Mason7108 Apps for Discord server moderation, music, utilities, verification, tickets, giveaways, and server management features.",
        "Server owners and managers are responsible for granting appropriate Discord permissions, configuring modules lawfully, and informing members when logs or moderation systems are enabled.",
        "You may not use bot7108 to harass, spam, scam, bypass Discord permissions, collect private information without permission, abuse moderation tools, or violate Discord rules.",
        "bot7108 is provided as is and may change, go offline, or be removed from a server when needed for safety, abuse prevention, maintenance, or legal reasons."
      ]
    ],
    "/privacy-policy": [
      "Privacy Policy",
      [
        "bot7108 stores information needed for enabled features, such as Discord user IDs, server IDs, channel IDs, role IDs, configuration settings, moderation records, warnings, command restrictions, ticket records, giveaway entries, verification agreement records, and support submissions.",
        "If logging is enabled, bot7108 may process deleted or edited message content that the bot can access. Server managers should inform members when logging is enabled.",
        "Discord OAuth for the dashboard uses identify and guilds scopes. Email is not requested. OAuth access tokens are encrypted server-side for the session and are not sent to the browser.",
        "bot7108 does not sell user data. Secrets such as bot tokens, session cookies, OAuth tokens, API keys, and database URLs should never be submitted through public forms."
      ]
    ],
    "/acceptable-use": [
      "Acceptable Use Policy",
      [
        "Do not use bot7108 to break Discord rules, automate abuse, spam users, evade bans, target protected classes, or expose private information.",
        "Do not use economy, giveaway, raffle, or gambling-style features for real-money wagering, paid entries, cryptocurrency, gift cards, or anything with real-world financial value.",
        "Do not attempt to exploit the dashboard, bypass role hierarchy, submit another server ID manually, overload API routes, or extract private tokens or infrastructure details.",
        "Mason7108 Apps may restrict access to bot7108 for abuse, security risk, or policy violations."
      ]
    ]
  };
  const [title, paragraphs] = legal[kind] || legal["/terms-of-service"];
  return `
    <section class="section">
      <div class="page-heading">
        <span class="eyebrow">Legal</span>
        <h1>${escapeHtml(title)}</h1>
        <p class="lead">Clear rules for using bot7108. Third-party names belong to their owners and are not official affiliations with Mason7108 Apps.</p>
      </div>
      <div class="legal-grid">
        ${paragraphs.map((text, index) => docCard(`${index + 1}. ${title}`, text)).join("")}
      </div>
    </section>
    ${footer()}`;
}

async function dashboardPage(parts) {
  if (!state.me) {
    return loginPrompt();
  }

  if (parts[1] === "owner") {
    if (!state.me.isOwner) {
      return `<section class="section"><div class="error-state"><h1>Unauthorized</h1><p>Bot owner access is required.</p><a class="button primary" href="/dashboard" data-link>Return to dashboard</a></div></section>${footer()}`;
    }
    return ownerConsolePage();
  }

  if (!state.guilds.length) {
    const response = await api("/api/auth/guilds");
    state.guilds = response.guilds || [];
  }

  const guildId = parts[1];
  if (!guildId) {
    return guildSelectionPage();
  }

  state.guildId = guildId;
  const section = parts[2] || "overview";
  const body = await dashboardSection(section);
  return `
    <section class="dashboard-layout">
      ${dashboardSidebar(section)}
      <div class="dashboard-main">${body}</div>
    </section>`;
}

function loginPrompt() {
  return `
    <section class="section">
      <div class="page-heading">
        <span class="eyebrow">Dashboard</span>
        <h1>Sign in with Discord</h1>
        <p class="lead">Use Discord OAuth with identify and guilds scopes to show servers you can manage.</p>
      </div>
      <a class="button primary" href="/auth/dashboard/discord?returnTo=/dashboard">Sign in</a>
    </section>
    ${footer()}`;
}

function guildSelectionPage() {
  const installed = state.guilds.filter((guild) => guild.installed);
  const notInstalled = state.guilds.filter((guild) => !guild.installed);
  return `
    <section class="section">
      <div class="dashboard-top">
        <div>
          <span class="eyebrow">Dashboard</span>
          <h1>Your servers</h1>
          <p class="muted">Only servers where Discord reports that you can manage the server are shown.</p>
        </div>
        <div class="button-row">
          ${state.me.isOwner ? `<a class="button primary" href="/dashboard/owner" data-link>Owner console</a>` : ""}
          <button class="button" data-logout>Sign out</button>
        </div>
      </div>
      <h2>bot7108 installed</h2>
      <div class="guild-grid">${installed.map(guildCard).join("") || `<div class="empty-state">No manageable installed servers found.</div>`}</div>
      <h2 style="margin-top: 32px">Not installed</h2>
      <div class="guild-grid">${notInstalled.map(guildCard).join("") || `<div class="empty-state">No additional manageable servers found.</div>`}</div>
    </section>`;
}

function guildCard(guild) {
  return `
    <article class="guild-card">
      <div class="guild-head">
        ${guild.iconUrl ? `<img class="guild-icon" src="${escapeHtml(guild.iconUrl)}" alt="" />` : `<div class="guild-icon" aria-hidden="true"></div>`}
        <div>
          <div class="guild-title">${escapeHtml(guild.name)}</div>
          <span class="badge ${guild.installed ? "ok" : "soon"}">${guild.installed ? "Installed" : "Not installed"}</span>
        </div>
      </div>
      ${
        guild.installed
          ? `<a class="button primary" href="/dashboard/${guild.id}/overview" data-link>Manage server</a>`
          : `<a class="button secondary" href="${escapeHtml(guild.inviteUrl)}">Add bot7108</a>`
      }
    </article>`;
}

function dashboardSidebar(active) {
  return `
    <aside class="dashboard-sidebar">
      <div class="sidebar-user">
        <img class="avatar" src="${escapeHtml(state.me.avatarUrl)}" alt="" />
        <div>
          <strong>${escapeHtml(state.me.displayName)}</strong>
          <div class="muted">@${escapeHtml(state.me.username)}</div>
        </div>
      </div>
      <nav class="sidebar-nav" aria-label="Dashboard sections">
        ${state.me.isOwner ? `<a class="sidebar-link" href="/dashboard/owner" data-link>Owner console</a>` : ""}
        ${dashboardSections
          .map(([id, label]) => `<a class="sidebar-link ${active === id ? "active" : ""}" href="/dashboard/${state.guildId}/${id}" data-link>${escapeHtml(label)}</a>`)
          .join("")}
      </nav>
    </aside>`;
}

function ownerSidebar() {
  return `
    <aside class="dashboard-sidebar">
      <div class="sidebar-user">
        <img class="avatar" src="${escapeHtml(state.me.avatarUrl)}" alt="" />
        <div>
          <strong>${escapeHtml(state.me.displayName)}</strong>
          <div class="muted">@${escapeHtml(state.me.username)}</div>
        </div>
      </div>
      <nav class="sidebar-nav" aria-label="Owner dashboard sections">
        <a class="sidebar-link" href="/dashboard" data-link>Servers</a>
        <a class="sidebar-link active" href="/dashboard/owner" data-link>Owner console</a>
      </nav>
    </aside>`;
}

function ownerChannelOptions(guildId) {
  const guild = state.ownerData?.guilds.find((item) => item.id === guildId);
  return (guild?.channels || [])
    .map((channel) => `<option value="${escapeHtml(channel.id)}">#${escapeHtml(channel.name)}</option>`)
    .join("");
}

async function ownerConsolePage() {
  const data = await api("/api/dashboard/owner/console");
  state.ownerData = data;
  const messageGuilds = data.guilds.filter((guild) => guild.channels.length > 0);
  const selectedGuild = messageGuilds[0];
  const presence = data.presence;

  return `
    <section class="dashboard-layout">
      ${ownerSidebar()}
      <div class="dashboard-main">
        <div class="dashboard-top">
          <div>
            <span class="eyebrow">Private owner controls</span>
            <h1>Bot console</h1>
          </div>
          ${statusBadge(true, "Owner only")}
        </div>

        <div class="owner-bot-card form-card">
          <img class="owner-bot-avatar" src="${escapeHtml(data.bot.avatarUrl)}" alt="bot7108 avatar" />
          <div>
            <h2>${escapeHtml(data.bot.username)}</h2>
            <p class="muted">${escapeHtml(data.bot.id)}</p>
            <span class="badge partial">${escapeHtml(presence.presenceStatus)}</span>
          </div>
        </div>

        <div class="settings-grid owner-console-grid">
          <form class="form-card" data-owner-presence-form>
            <h2>Presence</h2>
            <div class="form-grid">
              ${field("presenceStatus", "Status", `<select name="presenceStatus">
                ${["online", "idle", "dnd", "invisible"].map((status) => `<option value="${status}" ${presence.presenceStatus === status ? "selected" : ""}>${escapeHtml(status === "dnd" ? "Do not disturb" : status)}</option>`).join("")}
              </select>`)}
              ${field("activityType", "Activity", `<select name="activityType">
                ${["playing", "listening", "watching", "competing"].map((type) => `<option value="${type}" ${presence.activityType === type ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}
              </select>`)}
              <div class="field full-span">
                <label for="ownerActivityText">Activity text</label>
                <input id="ownerActivityText" name="activityText" maxlength="128" value="${escapeHtml(presence.activityText)}" placeholder="What bot7108 is doing" />
              </div>
            </div>
            <div class="button-row"><button class="button primary" type="submit">Update presence</button></div>
          </form>

          <form class="form-card" data-owner-profile-form>
            <h2>Username</h2>
            <div class="field">
              <label for="ownerBotUsername">Bot username</label>
              <input id="ownerBotUsername" name="username" minlength="2" maxlength="32" required value="${escapeHtml(data.bot.username)}" />
            </div>
            <div class="button-row"><button class="button secondary" type="submit">Change username</button></div>
          </form>

          <form class="form-card" data-owner-avatar-form enctype="multipart/form-data">
            <h2>Avatar</h2>
            <div class="field">
              <label for="ownerBotAvatar">Image file</label>
              <input id="ownerBotAvatar" name="avatar" type="file" accept="image/png,image/jpeg,image/gif,image/webp" required />
              <small>PNG, JPEG, GIF, or WebP. Maximum 2 MB.</small>
            </div>
            <div class="button-row"><button class="button secondary" type="submit">Upload avatar</button></div>
          </form>

          <form class="form-card full-span" data-owner-message-form>
            <h2>Send as bot7108</h2>
            ${messageGuilds.length ? `
              <div class="form-grid">
                ${field("guildId", "Server", `<select name="guildId" data-owner-guild required>${messageGuilds.map((guild) => `<option value="${escapeHtml(guild.id)}">${escapeHtml(guild.name)}</option>`).join("")}</select>`)}
                ${field("channelId", "Channel", `<select name="channelId" data-owner-channel required>${ownerChannelOptions(selectedGuild?.id)}</select>`)}
                <div class="field full-span">
                  <label for="ownerMessageContent">Message</label>
                  <textarea id="ownerMessageContent" name="content" minlength="1" maxlength="2000" required></textarea>
                  <small>Mentions are sent without notifications.</small>
                </div>
              </div>
              <div class="button-row"><button class="button primary" type="submit">Send message</button></div>
            ` : `<div class="empty-state">No writable text channels are available.</div>`}
          </form>

          <div class="panel full-span audit-table">
            <h2>Recent owner actions</h2>
            <table>
              <thead><tr><th>Time</th><th>Action</th><th>Target</th></tr></thead>
              <tbody>${data.recentAudit.map((event) => `<tr><td>${escapeHtml(new Date(event.createdAt).toLocaleString())}</td><td>${escapeHtml(event.action.replaceAll(".", " "))}</td><td>${escapeHtml(event.targetId || event.targetType)}</td></tr>`).join("") || `<tr><td colspan="3">No owner actions yet.</td></tr>`}</tbody>
            </table>
          </div>
        </div>
      </div>
    </section>`;
}

async function ensureGuildData() {
  if (state.guildData?.guild?.id === state.guildId) {
    return state.guildData;
  }
  const [summary, settings] = await Promise.all([
    api(`/api/dashboard/guilds/${state.guildId}/summary`),
    api(`/api/dashboard/guilds/${state.guildId}/settings`)
  ]);
  state.guildData = { ...settings, summary };
  return state.guildData;
}

async function dashboardSection(section) {
  const data = await ensureGuildData();
  if (section === "overview") return overviewSection(data);
  if (section === "moderation") return moderationSection(data);
  if (section === "automod") return automodSection(data);
  if (section === "welcome") return welcomeSection(data);
  if (section === "logging") return loggingSection(data);
  if (section === "commands") return commandsDashboardSection();
  if (section === "music") return musicSection(data);
  if (section === "tickets") return ticketsSection(data);
  if (section === "audit-log") return auditSection();
  if (section === "settings") return settingsSection(data);
  if (section === "server-statistics") return serverStatsSection(data);
  return comingSoonSection(section);
}

function overviewSection(data) {
  const summary = data.summary;
  return `
    <div class="dashboard-top">
      <div>
        <span class="eyebrow">Overview</span>
        <h1>${escapeHtml(summary.guild.name)}</h1>
        <p class="muted">Server ID: ${escapeHtml(summary.guild.id)}</p>
      </div>
      ${statusBadge(summary.guild.botOnline, "Bot online", "Bot offline")}
    </div>
    <div class="stats-strip">
      ${metric("Members", summary.guild.memberCount ?? "Unavailable")}
      ${metric("Commands", summary.stats.commands)}
      ${metric("Moderation Cases", summary.stats.moderationCases)}
    </div>
    <div class="settings-grid" style="margin-top: 16px">
      <div class="panel">
        <h3>Enabled modules</h3>
        <p>${summary.stats.enabledModules.map(escapeHtml).join(", ") || "None"}</p>
      </div>
      <div class="panel">
        <h3>Quick setup checklist</h3>
        ${summary.checklist.map((item) => `<div class="toggle-row"><span>${escapeHtml(item.label)}</span>${statusBadge(item.done, "Done", "Review")}</div>`).join("")}
      </div>
      <div class="panel">
        <h3>Recent moderation activity</h3>
        ${summary.recentCases.length ? summary.recentCases.map((item) => `<p>#${item.caseNumber} ${escapeHtml(item.action)} ${escapeHtml(item.targetTag || item.targetUserId || "")}</p>`).join("") : `<p class="muted">No dashboard moderation cases yet.</p>`}
      </div>
      <div class="panel">
        <h3>Recent dashboard changes</h3>
        ${summary.recentAudit.length ? summary.recentAudit.map((item) => `<p>${escapeHtml(item.action)} by ${escapeHtml(item.actorDisplayName)}</p>`).join("") : `<p class="muted">No dashboard changes yet.</p>`}
      </div>
    </div>`;
}

function optionList(items, selected, placeholder = "Select") {
  return `<option value="">${escapeHtml(placeholder)}</option>${items
    .map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.name)}</option>`)
    .join("")}`;
}

function moderationSection(data) {
  const textChannels = data.channels.filter((channel) => channel.configurable);
  return `
    <div class="dashboard-top"><div><span class="eyebrow">Control panel</span><h1>Moderation</h1><p class="muted">Every action is verified server-side against Discord permissions and role hierarchy.</p></div></div>
    <form class="form-card" data-moderation-form>
      <div class="form-grid">
        ${field("action", "Action", `<select name="action" required>
          <option value="warn">Warn member</option>
          <option value="timeout">Timeout member</option>
          <option value="untimeout">Remove timeout</option>
          <option value="kick">Kick member</option>
          <option value="ban">Ban member</option>
          <option value="unban">Unban user</option>
          <option value="purge">Purge messages</option>
          <option value="lock">Lock channel</option>
          <option value="unlock">Unlock channel</option>
          <option value="slowmode">Slowmode</option>
          <option value="remove_warning">Remove warning</option>
        </select>`)}
        ${field("targetUserId", "Target user ID", `<input name="targetUserId" inputmode="numeric" />`)}
        ${field("channelId", "Channel", `<select name="channelId">${optionList(textChannels)}</select>`)}
        ${field("durationSeconds", "Duration or slowmode seconds", `<input name="durationSeconds" type="number" min="0" max="2419200" />`)}
        ${field("messageCount", "Messages to purge", `<input name="messageCount" type="number" min="1" max="100" />`)}
        ${field("warningIndex", "Warning index", `<input name="warningIndex" type="number" min="0" />`)}
        <div class="field full-span"><label for="reason">Reason</label><textarea id="reason" name="reason" maxlength="500"></textarea></div>
        <div class="field full-span"><label for="notes">Moderator notes</label><textarea id="notes" name="notes" maxlength="1000"></textarea><small>Notes are stored in moderation cases and not sent to Discord.</small></div>
        <label class="toggle-row full-span"><span>Confirm destructive actions</span><input name="confirm" type="checkbox" /></label>
      </div>
      <div class="button-row"><button class="button danger" type="submit">Run action</button></div>
    </form>`;
}

function automodSection(data) {
  const a = data.settings.automod;
  return settingsForm("Automod", "Blocked words use word-boundary matching and are not matched inside unrelated words.", "automod", `
    <div class="settings-grid">
      ${toggle("enabled", "Automod enabled", a.enabled)}
      ${toggle("antiSpam", "Spam detection", a.antiSpam)}
      ${toggle("antiRaid", "Raid spike detection", a.antiRaid)}
      ${toggle("discordInviteFilter", "Invite-link filtering", a.discordInviteFilter)}
      ${toggle("linkFilter", "Suspicious-link filtering", a.linkFilter)}
      ${toggle("capsFilter", "Excessive-capital detection", a.capsFilter)}
      ${field("spamThreshold", "Spam threshold", `<input name="spamThreshold" type="number" min="2" max="20" value="${a.spamThreshold}" />`)}
      ${field("spamIntervalSec", "Spam interval seconds", `<input name="spamIntervalSec" type="number" min="3" max="120" value="${a.spamIntervalSec}" />`)}
      ${field("maxCapsRatio", "Caps ratio", `<input name="maxCapsRatio" type="number" min="0.4" max="1" step="0.05" value="${a.maxCapsRatio}" />`)}
      <div class="field full-span"><label for="blacklist">Blocked-word list</label><textarea id="blacklist" name="blacklist">${escapeHtml((a.blacklist || []).join("\n"))}</textarea><small>One blocked term per line.</small></div>
    </div>`);
}

function welcomeSection(data) {
  const w = data.settings.welcome;
  const channels = data.channels.filter((channel) => channel.configurable);
  return settingsForm("Welcome", "Safe placeholders: {user}, {username}, {server}, {memberCount}. HTML and code are rejected.", "welcome", `
    <div class="settings-grid">
      ${toggle("enabled", "Welcome enabled", w.enabled)}
      ${field("channelId", "Welcome channel", `<select name="channelId">${optionList(channels, w.channelId)}</select>`)}
      ${field("roleId", "Optional role assignment", `<select name="roleId">${optionList(data.roles.filter((role) => role.assignableByBot), w.roleId, "No role")}</select>`)}
      ${toggle("dmEnabled", "Send welcome DM", w.dmEnabled)}
      <div class="field full-span"><label for="message">Welcome message</label><textarea id="message" name="message">${escapeHtml(w.message)}</textarea></div>
      ${toggle("goodbyeEnabled", "Goodbye enabled", w.goodbyeEnabled)}
      ${field("goodbyeChannelId", "Goodbye channel", `<select name="goodbyeChannelId">${optionList(channels, w.goodbyeChannelId)}</select>`)}
      <div class="field full-span"><label for="goodbyeMessage">Goodbye message</label><textarea id="goodbyeMessage" name="goodbyeMessage">${escapeHtml(w.goodbyeMessage)}</textarea></div>
      <div class="field full-span"><label for="dmMessage">Direct message</label><textarea id="dmMessage" name="dmMessage">${escapeHtml(w.dmMessage)}</textarea></div>
      <div class="panel full-span"><h3>Preview</h3><p>${escapeHtml(w.message).replaceAll("{user}", "@Mason7108").replaceAll("{username}", "Mason7108").replaceAll("{server}", data.summary.guild.name).replaceAll("{memberCount}", String(data.summary.guild.memberCount || 0))}</p></div>
    </div>`);
}

function loggingSection(data) {
  const channels = data.channels.filter((channel) => channel.configurable);
  const labels = {
    moderation: "Moderation actions",
    messageDelete: "Deleted messages",
    messageEdit: "Edited messages",
    memberJoin: "Member joins",
    memberLeave: "Member leaves",
    roleUpdates: "Role updates",
    channelUpdates: "Channel updates",
    voiceActivity: "Voice-channel activity",
    dashboard: "Dashboard setting changes",
    automod: "Automod actions"
  };
  const body = Object.entries(labels)
    .map(([key, label]) => {
      const current = data.settings.logging[key];
      return `<div class="panel">
        ${toggle(`${key}.enabled`, label, current.enabled)}
        ${field(`${key}.channelId`, "Log channel", `<select name="${key}.channelId">${optionList(channels, current.channelId)}</select>`)}
        <p class="hint">Logs are only sent to channels bot7108 can access. Message-content logs depend on channel access and cache availability.</p>
      </div>`;
    })
    .join("");
  return settingsForm("Logging", "Enable each category separately and choose channels intentionally.", "logging", `<div class="settings-grid">${body}</div>`);
}

function musicSection(data) {
  const m = data.settings.musicSettings;
  return settingsForm("Music", "Uses only the existing DisTube-based music functionality. No downloading, ripping, or DRM bypass features are exposed.", "music", `
    <div class="settings-grid">
      ${toggle("music247Enabled", "24/7 mode", data.settings.music247Enabled)}
      ${field("defaultVolume", "Default volume", `<input name="defaultVolume" type="number" min="1" max="100" value="${m.defaultVolume}" />`)}
      ${field("maximumQueueLength", "Maximum queue length", `<input name="maximumQueueLength" type="number" min="1" max="500" value="${m.maximumQueueLength}" />`)}
      ${field("djRoleId", "DJ role", `<select name="djRoleId">${optionList(data.roles, m.djRoleId, "No DJ role")}</select>`)}
      <div class="panel full-span">
        <h3>Coming Soon <span class="badge soon">Planned</span></h3>
        <p>Music-controller channel, playlist policy, custom idle disconnect timing, and custom leave-when-empty behavior need bot-side playback workflow support before dashboard controls are enabled.</p>
      </div>
    </div>`);
}

function ticketsSection(data) {
  const t = data.settings.ticketSettings;
  const channels = data.channels.filter((channel) => channel.configurable);
  const categories = data.channels.filter((channel) => channel.category);
  return settingsForm("Tickets", "Tickets are private Discord channels controlled by Discord permissions.", "tickets", `
    <div class="settings-grid">
      ${field("ticketCategoryId", "Ticket category", `<select name="ticketCategoryId">${optionList(categories, data.settings.ticketCategoryId, "No category")}</select>`)}
      ${field("ticketHistoryChannelId", "Ticket history channel", `<select name="ticketHistoryChannelId">${optionList(channels, data.settings.ticketHistoryChannelId)}</select>`)}
      ${field("openingChannelId", "Ticket-opening channel", `<select name="openingChannelId">${optionList(channels, t.openingChannelId)}</select>`)}
      ${field("maxOpenTicketsPerUser", "Maximum open tickets per user", `<input name="maxOpenTicketsPerUser" type="number" min="1" max="10" value="${t.maxOpenTicketsPerUser}" />`)}
      ${toggle("closeConfirmation", "Close confirmation", t.closeConfirmation)}
      ${toggle("transcriptsEnabled", "Optional transcript setting", t.transcriptsEnabled)}
      ${field("staffRoleIds", "Support roles", `<select name="staffRoleIds" multiple>${data.roles.map((role) => `<option value="${role.id}" ${data.settings.staffRoleIds.includes(role.id) ? "selected" : ""}>${escapeHtml(role.name)}</option>`).join("")}</select>`)}
      <div class="field full-span"><label for="welcomeMessage">Ticket welcome message</label><textarea id="welcomeMessage" name="welcomeMessage">${escapeHtml(t.welcomeMessage)}</textarea></div>
    </div>`);
}

function settingsSection(data) {
  return settingsForm("Settings", "Module and role-policy controls for bot7108 management.", "settings", `
    <div class="settings-grid">
      <div class="panel full-span"><h3>Modules</h3>${Object.entries(data.settings.modules).map(([key, value]) => toggle(`modules.${key}`, key, value)).join("")}</div>
      ${field("rolePolicy.adminRoleIds", "Admin policy roles", `<select name="rolePolicy.adminRoleIds" multiple>${data.roles.map((role) => `<option value="${role.id}" ${data.settings.rolePolicy.adminRoleIds.includes(role.id) ? "selected" : ""}>${escapeHtml(role.name)}</option>`).join("")}</select>`)}
      ${field("rolePolicy.moderatorRoleIds", "Moderator policy roles", `<select name="rolePolicy.moderatorRoleIds" multiple>${data.roles.map((role) => `<option value="${role.id}" ${data.settings.rolePolicy.moderatorRoleIds.includes(role.id) ? "selected" : ""}>${escapeHtml(role.name)}</option>`).join("")}</select>`)}
      ${field("rolePolicy.helperRoleIds", "Helper policy roles", `<select name="rolePolicy.helperRoleIds" multiple>${data.roles.map((role) => `<option value="${role.id}" ${data.settings.rolePolicy.helperRoleIds.includes(role.id) ? "selected" : ""}>${escapeHtml(role.name)}</option>`).join("")}</select>`)}
    </div>`);
}

function settingsForm(title, intro, section, body) {
  return `
    <div class="dashboard-top"><div><span class="eyebrow">${escapeHtml(title)}</span><h1>${escapeHtml(title)}</h1><p class="muted">${escapeHtml(intro)}</p></div></div>
    <form class="form-card" data-settings-form="${escapeHtml(section)}">${body}<div class="button-row"><button class="button primary" type="submit">Save settings</button></div></form>`;
}

function toggle(name, label, checked) {
  return `<label class="toggle-row"><span>${escapeHtml(label)}</span><input type="checkbox" name="${escapeHtml(name)}" ${checked ? "checked" : ""} /></label>`;
}

async function commandsDashboardSection() {
  const data = await ensureGuildData();
  const response = await api(`/api/dashboard/guilds/${state.guildId}/commands`);
  return `
    <div class="dashboard-top"><div><span class="eyebrow">Command management</span><h1>Commands</h1><p class="muted">Essential management commands cannot be disabled.</p></div></div>
    <div class="command-list">
      ${response.commands
        .map(
          (command) => `
        <form class="command-row" data-command-form="${escapeHtml(command.name)}">
          <div><span class="code">${escapeHtml(command.slashFormat)}</span><p class="muted">${escapeHtml(command.category)}</p></div>
          <div>
            <strong>${escapeHtml(command.name)}</strong>
            <p>${escapeHtml(command.description)}</p>
            <div class="form-grid">
              ${toggle("enabled", "Enabled", command.enabled)}
              ${field("cooldownSec", "Cooldown seconds", `<input name="cooldownSec" type="number" min="0" max="3600" value="${command.cooldownSec}" />`)}
              ${field("allowedRoleIds", "Restrict to roles", `<select name="allowedRoleIds" multiple>${data.roles.map((role) => `<option value="${role.id}" ${command.allowedRoleIds.includes(role.id) ? "selected" : ""}>${escapeHtml(role.name)}</option>`).join("")}</select>`)}
              ${field("allowedChannelIds", "Restrict to channels", `<select name="allowedChannelIds" multiple>${data.channels.filter((channel) => channel.configurable).map((channel) => `<option value="${channel.id}" ${command.allowedChannelIds.includes(channel.id) ? "selected" : ""}>${escapeHtml(channel.name)}</option>`).join("")}</select>`)}
            </div>
          </div>
          <div><button class="button secondary" type="submit">Save</button>${command.essential ? `<p class="hint">Essential</p>` : ""}</div>
        </form>`
        )
        .join("")}
    </div>`;
}

async function auditSection() {
  const response = await api(`/api/dashboard/guilds/${state.guildId}/audit`);
  return `
    <div class="dashboard-top"><div><span class="eyebrow">Audit log</span><h1>Dashboard audit log</h1><p class="muted">Configuration changes and dashboard moderation actions.</p></div></div>
    <div class="panel audit-table">
      <table>
        <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead>
        <tbody>${response.events.map((event) => `<tr><td>${escapeHtml(new Date(event.createdAt).toLocaleString())}</td><td>${escapeHtml(event.actorDisplayName)}<br /><span class="muted">${escapeHtml(event.actorUserId)}</span></td><td>${escapeHtml(event.action)}</td><td>${escapeHtml(event.targetId || event.targetType)}</td></tr>`).join("") || `<tr><td colspan="4">No audit events yet.</td></tr>`}</tbody>
      </table>
    </div>`;
}

function serverStatsSection(data) {
  return `
    <div class="dashboard-top"><div><span class="eyebrow">Server statistics</span><h1>Server Statistics</h1><p class="muted">Statistics are limited to data bot7108 already tracks safely.</p></div></div>
    <div class="stats-strip">
      ${metric("Members", data.summary.guild.memberCount ?? "Unavailable")}
      ${metric("Commands", data.summary.stats.commands)}
      ${metric("Moderation Cases", data.summary.stats.moderationCases)}
    </div>`;
}

function comingSoonSection(section) {
  const label = dashboardSections.find(([id]) => id === section)?.[1] || "Module";
  return `<div class="dashboard-top"><div><span class="eyebrow">Coming Soon</span><h1>${escapeHtml(label)}</h1><p class="muted">This module is visible for planning, but bot7108 does not currently include production functionality for it.</p></div></div><div class="empty-state">No fake controls are shown for unfinished functionality.</div>`;
}

function collectForm(form, section) {
  const data = {};
  const entries = new FormData(form);
  for (const element of form.elements) {
    if (!element.name || element.disabled) continue;
    const name = element.name;
    if (element.type === "checkbox") {
      setDeep(data, name, element.checked);
    } else if (element.multiple) {
      setDeep(data, name, Array.from(element.selectedOptions).map((option) => option.value).filter(Boolean));
    } else if (element.type === "number") {
      const value = element.value === "" ? undefined : Number(element.value);
      setDeep(data, name, value);
    } else {
      setDeep(data, name, entries.get(name)?.toString() || "");
    }
  }

  if (section === "automod" && typeof data.blacklist === "string") {
    data.blacklist = data.blacklist.split(/\r?\n/).map((word) => word.trim()).filter(Boolean);
  }

  if (section === "logging") {
    return { logging: data };
  }
  if (section === "settings") {
    return { modules: data.modules || {}, rolePolicy: data.rolePolicy || {} };
  }
  if (section === "music") {
    return { music: data };
  }
  if (section === "tickets") {
    return { tickets: data };
  }
  return { [section]: data };
}

function setDeep(target, path, value) {
  const parts = path.split(".");
  let cursor = target;
  while (parts.length > 1) {
    const part = parts.shift();
    cursor[part] ||= {};
    cursor = cursor[part];
  }
  cursor[parts[0]] = value;
}

async function handleSupportSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.startedAt = Number(payload.startedAt);
  try {
    await api("/api/public/support", { method: "POST", body: JSON.stringify(payload) });
    toast("Submission received.");
    form.reset();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function handleSettingsSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const section = form.dataset.settingsForm;
  const payload = collectForm(form, section);
  try {
    const response = await api(`/api/dashboard/guilds/${state.guildId}/settings`, {
      method: "PATCH",
      csrf: true,
      body: JSON.stringify(payload)
    });
    state.guildData.settings = response.settings;
    toast(response.message || "Settings saved.");
    await render();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function handleCommandSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = collectForm(form, "command");
  try {
    await api(`/api/dashboard/guilds/${state.guildId}/commands/${form.dataset.commandForm}`, {
      method: "PATCH",
      csrf: true,
      body: JSON.stringify(payload.command || payload)
    });
    toast("Command settings saved.");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function handleModerationSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = collectForm(form, "moderation").moderation;
  try {
    const response = await api(`/api/dashboard/guilds/${state.guildId}/moderation/actions`, {
      method: "POST",
      csrf: true,
      body: JSON.stringify(payload)
    });
    toast(`${response.message} Case #${response.caseNumber}.`);
    form.reset();
  } catch (error) {
    toast(error.message, "error");
  }
}

function handleOwnerGuildChange(event) {
  const channelSelect = document.querySelector("[data-owner-channel]");
  if (channelSelect) {
    channelSelect.innerHTML = ownerChannelOptions(event.currentTarget.value);
  }
}

async function handleOwnerMessageSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    await api("/api/dashboard/owner/messages", {
      method: "POST",
      csrf: true,
      body: JSON.stringify(payload)
    });
    form.querySelector("[name=content]").value = "";
    toast("Message sent.");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function handleOwnerPresenceSubmit(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const response = await api("/api/dashboard/owner/presence", {
      method: "PATCH",
      csrf: true,
      body: JSON.stringify(payload)
    });
    state.ownerData.presence = response.presence;
    toast(response.message);
  } catch (error) {
    toast(error.message, "error");
  }
}

async function handleOwnerProfileSubmit(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  if (!window.confirm(`Change the bot username to ${payload.username}?`)) {
    return;
  }

  try {
    const response = await api("/api/dashboard/owner/profile", {
      method: "PATCH",
      csrf: true,
      body: JSON.stringify(payload)
    });
    state.ownerData.bot.username = response.username;
    toast(response.message);
    await render();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function handleOwnerAvatarSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = new FormData(form);
  if (!payload.get("avatar")?.size || !window.confirm("Replace the bot avatar with this image?")) {
    return;
  }

  try {
    const response = await api("/api/dashboard/owner/avatar", {
      method: "POST",
      csrf: true,
      body: payload
    });
    state.ownerData.bot.avatarUrl = response.avatarUrl;
    toast(response.message);
    await render();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST", csrf: true });
    state.me = null;
    state.guilds = [];
    state.guildData = null;
    state.ownerData = null;
    toast("Signed out.");
    navigate("/dashboard");
  } catch (error) {
    toast(error.message, "error");
  }
}

function bindEvents() {
  document.querySelectorAll("[data-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#")) return;
      event.preventDefault();
      navigate(href);
    });
  });

  document.querySelector("[data-command-search]")?.addEventListener("input", (event) => {
    const query = event.target.value.toLowerCase();
    const filtered = state.commands.filter((command) => `${command.name} ${command.description} ${command.category}`.toLowerCase().includes(query));
    document.querySelector("[data-command-list]").innerHTML = renderCommandRows(filtered);
  });

  document.querySelector("[data-support-form]")?.addEventListener("submit", handleSupportSubmit);
  document.querySelectorAll("[data-settings-form]").forEach((form) => form.addEventListener("submit", handleSettingsSubmit));
  document.querySelectorAll("[data-command-form]").forEach((form) => form.addEventListener("submit", handleCommandSubmit));
  document.querySelector("[data-moderation-form]")?.addEventListener("submit", handleModerationSubmit);
  document.querySelector("[data-owner-guild]")?.addEventListener("change", handleOwnerGuildChange);
  document.querySelector("[data-owner-message-form]")?.addEventListener("submit", handleOwnerMessageSubmit);
  document.querySelector("[data-owner-presence-form]")?.addEventListener("submit", handleOwnerPresenceSubmit);
  document.querySelector("[data-owner-profile-form]")?.addEventListener("submit", handleOwnerProfileSubmit);
  document.querySelector("[data-owner-avatar-form]")?.addEventListener("submit", handleOwnerAvatarSubmit);
  document.querySelector("[data-logout]")?.addEventListener("click", logout);
}

async function render() {
  setLoading();
  try {
    if (!state.config || !state.status || !state.commands.length) {
      await loadBootstrap();
    } else {
      const me = await api("/api/auth/me");
      state.me = me.authenticated ? me.user : null;
      state.csrfToken = me.csrfToken || null;
    }

    const path = routePath();
    const parts = path.split("/").filter(Boolean);
    if (path === "/") app.innerHTML = homePage();
    else if (path === "/features") app.innerHTML = featuresPage();
    else if (path === "/commands") app.innerHTML = commandsPage();
    else if (path === "/status") app.innerHTML = statusPage();
    else if (path === "/docs") app.innerHTML = docsPage();
    else if (path === "/support") app.innerHTML = supportPage();
    else if (path === "/terms-of-service" || path === "/privacy-policy" || path === "/acceptable-use") app.innerHTML = legalPage(path);
    else if (path === "/unauthorized") app.innerHTML = `<section class="section"><div class="error-state"><h1>Unauthorized</h1><p>Discord login failed, expired, or is not configured yet.</p><a class="button primary" href="/dashboard" data-link>Return to dashboard</a></div></section>${footer()}`;
    else if (parts[0] === "dashboard") app.innerHTML = await dashboardPage(parts);
    else app.innerHTML = `<section class="section"><div class="error-state"><h1>Not found</h1><p>The page you requested does not exist.</p><a class="button primary" href="/" data-link>Go home</a></div></section>${footer()}`;
    updateNav(path);
    bindEvents();
    app.focus({ preventScroll: true });
  } catch (error) {
    app.innerHTML = `<section class="section"><div class="error-state"><h1>Something went wrong</h1><p>${escapeHtml(error.message)}</p><button class="button primary" data-retry>Retry</button></div></section>`;
    document.querySelector("[data-retry]")?.addEventListener("click", render);
  }
}

function updateNav(path) {
  document.querySelectorAll(".nav-links a").forEach((link) => {
    const href = link.getAttribute("href");
    if (href === path || (href !== "/" && path.startsWith(href))) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

navToggle?.addEventListener("click", () => {
  const open = navLinks.classList.toggle("open");
  navToggle.setAttribute("aria-expanded", String(open));
});

window.addEventListener("popstate", render);
render();
