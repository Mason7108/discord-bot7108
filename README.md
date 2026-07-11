# All-in-One Modular Discord Bot

A greenfield TypeScript Discord bot built with `discord.js v14`, `mongoose`, `express`, and `distube`.

## Features

- Slash command + event loaders (dynamic)
- Module toggles per guild via `/modules`
- Moderation + automod + mod logging
- Ticket system with button-based creation + transcript on close
- Economy + leveling (Mongo-backed)
- Music system (DisTube)
- Discord Activity control panel for music/video queue management
- Spoken music controls with opt-in `/voicecommands`
- Voice channel chat text-to-speech with opt-in `/vctts`
- Giveaways with button join and auto winner selection
- Utility + fun commands
- Express dashboard API scaffold (`/health`, settings GET/PATCH)
- Button-based CAPTCHA verification flow (`/verify` web page + Discord button)
- Terms of Service and Privacy Policy agreement flow (`/terms`, `/privacy` + Discord OAuth submit)
- Welcome embed system for new members
- Message logging for deletes/edits (with jump-to-message button on edits)

## Folder Structure

```text
src/
  api/
  config/
  core/
  events/
  models/
  modules/
  systems/
  utils/
```

## Setup

1. Copy `.env.example` to `.env` and fill values.
2. Install deps:

```bash
npm install
```

3. Run development:

```bash
npm run dev
```

4. Build and run production:

```bash
npm run build
npm start
```

## bot7108 Activity

The Discord Activity frontend lives in `activity/`. The production build is served at `/` by the same Express/Socket.IO process as the bot API. YouTube videos play on each participant's device through the visible official YouTube IFrame Player. The server synchronizes queue commands and timing only; it never downloads, extracts, or restreams Activity YouTube audio.

Calling `/play` with no options launches the Activity. Calling `/play query:...` or `/play file:...` preserves the existing, separate DisTube voice-bot behavior.

Development:

```bash
npm run dev
npm run activity:dev
```

The API uses `API_PORT`/`PORT` (default `3000`); Vite uses `5173` and proxies `/api` and `/socket.io` to the API. Open `http://localhost:5173/?scope=test-room&user=Host` for a development session. Use a second browser profile with the same `scope` and another `user` value to test synchronization.

### Discord Developer Portal setup

1. Select the same Discord application used by bot7108 and enable Activities.
2. Add the OAuth2 redirect URI required by your Activity deployment and set the same value in `DISCORD_REDIRECT_URI` when your OAuth configuration requires it.
3. Configure URL mappings to the single public HTTPS deployment: `/` -> deployment host, `/api` -> deployment host, and `/socket.io` -> deployment host. Do not include paths in the target host fields unless the portal UI explicitly requests a full target URL.
4. Allow the origin `https://CLIENT_ID.discordsays.com` in deployment configuration. The server includes that origin automatically from `CLIENT_ID`; add tunnel or custom origins to `ACTIVITY_ALLOWED_ORIGINS` as a comma-separated list.
5. Install the app in a test server with the `applications.commands` and `identify` OAuth scopes. The application needs its normal bot permissions to see members and voice channels.
6. Join a voice channel and run `/play` with no query or file. Discord responds with the Activity launch callback and opens the mapped web app.

For local Discord testing, run both development processes, create an HTTPS tunnel to port `5173`, and temporarily point all three URL mappings at that tunnel host. Tunnel URLs are temporary and must be replaced when they change.

### Google Cloud and Spotify

- Enable YouTube Data API v3 in a Google Cloud project, create an API key, restrict it to YouTube Data API v3 and the backend deployment where supported, then set `YOUTUBE_API_KEY` on the server. The key is never bundled into Vite.
- Set `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` from a Spotify developer application to enable Spotify URL metadata. Spotify entries are always labeled metadata-only and cannot play audio in this Activity.
- If Spotify credentials are absent, YouTube and uploads continue to work and Spotify resolution returns a configuration message.

### Upload storage

Development uploads are written under `UPLOAD_DIRECTORY` with generated filenames and a limit set by `UPLOAD_MAX_MB`. Railway's normal container filesystem is ephemeral. Production should attach a persistent volume or replace this development store with private object storage and signed media URLs. Users should upload only audio they own or have permission to share.

### Activity socket protocol

The server-authoritative protocol uses `session:join`, `session:state`, `sync:request`, `queue:add`, `queue:remove`, `queue:reorder`, `queue:clear`, `queue:play-next`, `player:play`, `player:pause`, `player:seek`, `player:next`, `player:previous`, `player:ended`, `settings:shuffle`, `settings:repeat`, `settings:collaboration`, and `host:transfer`. Every mutation returns a structured acknowledgement. The first participant is host, host status transfers on disconnect, and browser-provided identities or room names are not accepted in production sockets.

## Required Environment Variables

- `BOT_TOKEN`
- `CLIENT_ID`
- `MONGO_URI`

Optional:

- `DEV_GUILD_ID` (guild-scoped slash sync in development)
- `API_PORT`
- `DISCORD_CLIENT_SECRET` or `DISCORD_OAUTH_CLIENT_SECRET` (required for Discord Activity user auth)
- `DISCORD_REDIRECT_URI` (Activity OAuth redirect URI when configured in the portal)
- `ACTIVITY_SESSION_SECRET` (recommended in all environments and required for stable production sessions; at least 32 characters)
- `ACTIVITY_ALLOWED_ORIGINS` (optional comma-separated tunnel or custom origins)
- `ACTIVITY_SESSION_TTL_MIN` (optional signed session lifetime, default `240`)
- `FRONTEND_ORIGIN` (local or deployed frontend origin)
- `PUBLIC_ACTIVITY_URL` and `BACKEND_PUBLIC_URL` (deployment URLs used for documentation and origin policy)
- `YOUTUBE_API_KEY` (required for Activity YouTube search and link resolution)
- `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` (optional, metadata only)
- `UPLOAD_MAX_MB` (Activity upload limit, default `25`, maximum `100`)
- `UPLOAD_DIRECTORY` (development upload path, default `data/activity-uploads`)
- `VITE_DISCORD_CLIENT_ID` (optional; Vite falls back to `CLIENT_ID`)
- `VITE_ACTIVITY_API_BASE_URL` (optional Activity API origin override)
- `BOT_OWNER_ID` (user allowed to post Discord invite links; falls back to the Discord server owner if unset)
- `MAIN_GUILD_ID` (main server where bans are detected; falls back to `GUILD_ID` if unset)
- `APPEAL_GUILD_ID` (appeal server; defaults to `1490191877960503457`)
- `APPEAL_REVIEW_CHANNEL_ID` (staff-only channel where submitted appeals are posted)
- `BANNED_USER_ROLE_ID` (optional appeal-server role assigned to users with ban records; otherwise the bot looks for a `Banned User` role)
- `APPEAL_SERVER_INVITE` (recommended permanent invite sent by DM after bans; if unset, the bot tries to create one)
- `AI_API_KEY`
- `OPENAI_API_KEY` or `VOICE_COMMANDS_OPENAI_API_KEY` (required only for `/voicecommands enable`; used for speech-to-text)
- `VOICE_COMMANDS_STT_MODEL` (optional, default `whisper-1`)
- `VOICE_COMMANDS_COOLDOWN_SEC` (optional spoken-command cooldown, default `5`)
- `VOICE_COMMANDS_TRANSCRIPTION_COOLDOWN_SEC` (optional per-user transcription throttle, default `2`)
- `VOICE_COMMANDS_MAX_AUDIO_SEC` (optional max captured phrase length, default `10`)
- `VOICE_COMMANDS_SILENCE_MS` (optional silence cutoff for a spoken phrase, default `1200`)
- `VOICE_COMMANDS_TRANSCRIBE_TIMEOUT_MS` (optional speech-to-text request timeout, default `15000`)
- `VC_TTS_ENGINE_PATH` (optional voice-channel TTS engine path, default `espeak-ng`)
- `VC_TTS_VOICE` (optional espeak voice, default `en-us`)
- `VC_TTS_SPEED` (optional voice-channel TTS speed, default `165`)
- `VC_TTS_PITCH` (optional voice-channel TTS pitch, default `50`)
- `VC_TTS_MAX_CHARS` (optional max spoken VC chat message length, default `220`)
- `VC_TTS_QUEUE_LIMIT` (optional max queued VC TTS messages per server, default `5`)
- `YOUTUBE_COOKIES_BASE64` (recommended) or `YOUTUBE_COOKIES`/`YOUTUBE_COOKIES_JSON` (optional YouTube cookie JSON array for music playback when YouTube blocks anonymous server playback)
- `YTDLP_PROXY` or `YOUTUBE_PROXY` (optional proxy URL for YouTube extraction if Railway's IP is blocked)
- `YTDLP_TIMEOUT_MS` (optional, default `15000`)
- `YTDLP_SEARCH_LIMIT` (optional, default `5`)
- `YTDLP_MAX_CANDIDATES` (optional, default `3`)
- `YTDLP_EXTRACTOR_ARGS` (optional advanced yt-dlp extractor args override)
- `FFMPEG_USER_AGENT` or `YTDLP_USER_AGENT` (optional media request user-agent override)
- `MP3_ATTACHMENT_MAX_BYTES` (optional max Discord MP3 upload size for `/play file:`, default `26214400`, capped at `104857600`)
- `FFMPEG_REFERER` (optional media request referer override, defaults to `https://www.youtube.com/`)
- `FFMPEG_PROXY` (optional proxy URL for FFmpeg media fetches; defaults to `YTDLP_PROXY`/`YOUTUBE_PROXY` when set)
- `DISCORD_OAUTH_CLIENT_SECRET` (required for the terms agreement submit flow)
- `AGREEMENT_COOKIE_SECRET` (required for signed agreement/OAuth cookies)

Verification (Railway/web) variables:

- `VERIFY_CHANNEL_ID` (channel where verification embed/button is posted)
- `WELCOME_CHANNEL_ID` (channel for welcome embeds)
- `MESSAGE_LOG_CHANNEL_ID` (channel for message delete/edit logs)
- `INVITE_GENERATOR_CHANNEL_ID` (channel where the invite-link generator button panel is posted)
- `INVITE_LOG_CHANNEL_ID` (channel for invite generated/used logs)
- `VERIFIED_ROLE_ID` or `VERIFIED_ROLE_NAME`
- `UNVERIFIED_ROLE_ID` or `UNVERIFIED_ROLE_NAME`
- `BASE_URL` (for example: `https://your-app.up.railway.app`)
- `RECAPTCHA_SITE_KEY`
- `RECAPTCHA_SECRET_KEY`
- `LOG_CHANNEL_ID` (optional verification logs)
- `AGREEMENT_CHANNEL_ID` (channel where the TOS/privacy agreement message is posted; defaults to `1511227468873465856`)
- `AGREEMENT_LOG_CHANNEL_ID` (channel where successful TOS/privacy agreements are logged; defaults to `1511432273797451796`)
- `VERIFY_TOKEN_TTL_SEC` (default `600`, must be `300-900`)
- `VERIFY_BUTTON_COOLDOWN_SEC` (default `15`)

Token/port compatibility:

- `DISCORD_TOKEN` is supported as an alias for `BOT_TOKEN`
- `PORT` is supported and falls back to `API_PORT`

## Command Highlights

- Admin: `/help`, `/config`, `/modules`, `/vctts`
- Moderation: `/kick /ban /unban /timeout /untimeout /mute /unmute /warn /warnlist /purge /slowmode /lock /unlock /commandrestrict /appeal /banstatus /setpermban /reviewappeal`
- AutoMod blocks Discord invite links by default unless the sender is `BOT_OWNER_ID` or, when unset, the Discord server owner. Toggle with `/config automod setting:discordInviteFilter value:false`.
- Tickets: `/ticket setup|close|add|remove|syncmods|modaccess` + in-ticket buttons (`Close`, `Close With Reason`, `Claim`)
- Economy: `/balance /daily /work /pay /shop /inventory /gamble /coinflip /eco-leaderboard`
- Leveling: `/level /rank /leaderboard /setlevelrole`
- Music: `/play /pause /resume /skip /queue /stop /leave /volume /music247`
- Voice commands: `/voicecommands enable|disable|status`
- VC text-to-speech: `/vctts enable|disable|status`
- Giveaways: `/giveaway start|end|reroll|delete`
- Utility/Fun: `/ping /serverinfo /userinfo /avatar /poll /remind /math /splitvc /movevc /meme /eightball /joke /roll /trivia /askai`

## Music Playback Notes

`/play` supports either a normal song URL/search query or a Discord-uploaded MP3 attachment. Use `/play file:` and select an `.mp3`; the bot streams the Discord attachment URL into the same DisTube queue used by `/pause`, `/resume`, `/skip`, `/queue`, `/stop`, `/leave`, `/volume`, and `/music247`. Uploaded MP3s are not saved by the bot.

YouTube may block datacenter playback with `Sign in to confirm you're not a bot` or reject anonymous format extraction. If that happens, export YouTube cookies from a dedicated YouTube account and set them in Railway as `YOUTUBE_COOKIES_BASE64`. The bot uses those cookies for YouTube search and for `yt-dlp` stream extraction.

Expected value: base64-encoded JSON cookie array from a browser cookie export tool. Do not paste cookies into code or commit them. If you use raw JSON instead, set `YOUTUBE_COOKIES` or `YOUTUBE_COOKIES_JSON`.

If Railway still receives `Requested format is not available` or `no playable audio formats` after cookies are set, YouTube is likely blocking Railway's host/IP. Set `YTDLP_PROXY` or `YOUTUBE_PROXY` to a proxy URL so `yt-dlp` extracts through a less-blocked network. FFmpeg will also use that proxy for the final media fetch; set `FFMPEG_PROXY` only if FFmpeg needs a different proxy URL. The bot also supports `YTDLP_TIMEOUT_MS`, `YTDLP_SEARCH_LIMIT`, and `YTDLP_MAX_CANDIDATES` to keep failed lookups from hanging too long.

yt-dlp and FFmpeg use browser-like request headers when extracting and reading YouTube media URLs. For yt-dlp streams, the bot passes the selected format's request headers to FFmpeg before playback. If playback still says it started but no audio comes through, set `LOG_LEVEL=debug` and check the deploy logs for DisTube/FFmpeg messages. You can override those media headers with `YTDLP_USER_AGENT`, `FFMPEG_USER_AGENT`, and `FFMPEG_REFERER`.

After a song starts, the bot checks whether Discord voice is actually healthy. If it reports missing UDP ping, the host is not completing Discord's voice UDP path even though commands and queue messages still work. Move the bot to a VPS or another host with reliable Discord voice UDP, or use a Lavalink node hosted there.

If `/volume` reports `No active queue` immediately after `Now playing`, the stream ended before Discord received sustained audio. The bot reports this as a short-finish diagnostic and points to the deploy logs, YouTube cookies, or proxy settings.

When the queue is empty and the bot remains in a voice channel, it waits 2 minutes, posts an idle notice in the voice channel chat when possible, and disconnects. Enable `/music247` if you want the bot to stay connected while idle.

Railway installs system `ffmpeg` through both `railpack.json` and `nixpacks.toml`, and the bot prefers an absolute Linux system binary over `ffmpeg-static`. The build runs `ffmpeg -version`; if Railway cannot install FFmpeg, the deploy should fail before the bot starts. If logs still say `ffmpeg is not installed at 'ffmpeg' path`, confirm Railway deployed the latest commit and, if needed, set the Railway service variable `RAILPACK_DEPLOY_APT_PACKAGES=ffmpeg`. If logs show `signal=SIGSEGV` from `/app/node_modules/ffmpeg-static/ffmpeg`, redeploy the latest commit so Railway uses the system package.

## Voice Channel Text-To-Speech Setup

VC TTS is disabled by default per server. A server admin must run `/vctts enable` before the bot reads voice channel chat aloud. Run `/vctts disable` to turn it off, and `/vctts status` to verify the speech engine.

When enabled, a user can type in the text chat attached to a voice channel and the bot will speak that message in that same voice channel. The user must be connected to that voice channel. The bot skips VC TTS while a music queue is active so it does not interrupt songs.

VC TTS uses `espeak-ng` and does not require an OpenAI API key. Railway installs `espeak-ng` through both deployment configs. For local development, install `espeak-ng` yourself or set `VC_TTS_ENGINE_PATH` to a compatible executable.

## Voice Command Setup

Voice commands are disabled by default per server. A server admin must run `/voicecommands enable` before bot7108 will process spoken commands. Run `/voicecommands disable` to turn them off for that server, and `/voicecommands status` to verify whether recognition is configured and whether the bot is currently listening.

Supported wake-phrase commands:

```text
hey bot7108 play [song name]
hey bot7108 pause
hey bot7108 resume
hey bot7108 skip
hey bot7108 stop
hey bot7108 leave
```

Speech-to-text requires `VOICE_COMMANDS_OPENAI_API_KEY` or `OPENAI_API_KEY`. If neither is set, `/voicecommands enable` fails with a clear setup error and the listener will not capture voice audio.

Privacy behavior:

- The bot listens only while it is already connected to a voice channel and voice commands are enabled for that server.
- Short audio snippets are processed only to detect commands starting with `hey bot7108`.
- Raw audio files are not written to disk. Audio is held in memory only long enough to transcribe the phrase, then discarded.
- Detected commands are logged with guild ID, user ID, command name, and query for debugging. Non-command speech is not logged as transcript text.
- Voice commands reuse the normal music command permission checks, module checks, command restrictions, terms gating, and cooldowns.

## Verification Flow

1. On startup, the bot checks `VERIFY_CHANNEL_ID` and ensures exactly one verification message exists.
2. The message contains:
   - Title: `Server Verification`
   - Description: `Click the button below to verify and gain access to the server.`
   - Button: `Verify`
3. Clicking `Verify` creates a secure short-lived token and returns an ephemeral verification link.
4. `/verify` renders a Google reCAPTCHA v2 page.
5. On successful CAPTCHA:
   - token is consumed (single-use)
   - `Verified` role is assigned
   - `Unverified` role is removed (if present)
   - verification log is posted to `LOG_CHANNEL_ID` (if configured)

## Terms and Privacy Agreement Flow

1. On startup, the bot checks `AGREEMENT_CHANNEL_ID` and creates or updates the bot7108 agreement message.
2. The message button opens `/terms?guildId=<server-id>` on `BASE_URL`.
3. Users can read the public Terms of Service and Privacy Policy without logging in.
4. To submit agreement, users sign in with Discord OAuth2 using the `identify` scope.
5. The agreement is stored in MongoDB with Discord user ID, server ID, accepted status, accepted timestamp, and terms version `2026-06-01`.
6. A log embed is posted to `AGREEMENT_LOG_CHANNEL_ID` when someone agrees.
7. Slash commands, autocomplete, buttons, modals, and leveling rewards are blocked until the current terms version is accepted.

Update announcement policy:

- When bot7108 is updated, post a message in the updates announcement channel `1523399601225203892` explaining what changed and what is new.
- Review the Terms of Service and Privacy Policy on the first day of every month. If either policy changed or new terms were added, post the update in the tos-updates channel `1523399665213767731`.

Discord OAuth setup:

1. In the Discord Developer Portal, add this redirect URL to the bot application:

```text
https://your-app.up.railway.app/auth/discord/callback
```

2. Copy the OAuth2 client secret into Railway:
   - `DISCORD_OAUTH_CLIENT_SECRET`
3. Set a strong random cookie signing secret in Railway:
   - `AGREEMENT_COOKIE_SECRET`

## Google reCAPTCHA Setup (v2 Checkbox)

1. In Google reCAPTCHA admin, create a **reCAPTCHA v2 Checkbox** site.
2. Add your Railway hostname (for example: `discord-bot7108-production.up.railway.app`) to allowed domains.
3. Copy the keys into Railway variables:
   - `RECAPTCHA_SITE_KEY`
   - `RECAPTCHA_SECRET_KEY`

## Railway Deployment

1. Push this repo to GitHub.
2. In Railway, create a new project from the repo.
3. Set all required environment variables (`BOT_TOKEN`/`DISCORD_TOKEN`, `CLIENT_ID`, `MONGO_URI`, verification vars).
4. Ensure `BASE_URL` matches your Railway public URL.
5. Deploy. Railway provides `PORT` automatically; the app already supports it. The included `railpack.json` and `nixpacks.toml` install Node.js 22, Python 3, system FFmpeg, `espeak-ng` for VC TTS, and replace the default `yt-dlp` launcher with the standalone Linux `yt-dlp` binary for music playback.

## Notes

- Music commands are enabled by default for new guilds. For existing guild records where music was previously disabled, enable with `/modules enable module:music`.
- VC TTS uses the music module gate because it joins and speaks in voice channels.
- Ban appeals use a DM invite flow. Discord bots cannot force-add banned users to the appeal server unless the user completed OAuth2 with `guilds.join` and the bot has a valid user access token.
- Appeal setup: put `MAIN_GUILD_ID`, `APPEAL_GUILD_ID=1490191877960503457`, `APPEAL_REVIEW_CHANNEL_ID`, `BANNED_USER_ROLE_ID` if you use a fixed appeal-server role, and `APPEAL_SERVER_INVITE` in `.env` locally or Railway environment variables in production.
- Required bot permissions: main server `View Audit Log` for moderator/reason lookup, `Send Messages`, and normal moderation event access; appeal server `Manage Roles`, `Send Messages`, and `Create Instant Invite` only if `APPEAL_SERVER_INVITE` is not configured.
- Required intents: `Guilds`, `GuildMembers`, `GuildModeration`, and message/interaction intents already configured by the bot.
- `askai` is scaffolded and intentionally guarded behind `AI_API_KEY`.
- Dashboard auth/OAuth is scaffold-only and must be hardened before production.
- Ticket history channel can be configured with `/config tickethistory channel:#your-channel`.
