# All-in-One Modular Discord Bot

A greenfield TypeScript Discord bot built with `discord.js v14`, `mongoose`, `express`, and `distube`.

## Features

- Slash command + event loaders (dynamic)
- Module toggles per guild via `/modules`
- Moderation + automod + mod logging
- Ticket system with button-based creation + transcript on close
- Economy + leveling (Mongo-backed)
- Music system (DisTube)
- Giveaways with button join and auto winner selection
- Utility + fun commands
- Express dashboard API scaffold (`/health`, settings GET/PATCH)
- Button-based CAPTCHA verification flow (`/verify` web page + Discord button)

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

## Required Environment Variables

- `BOT_TOKEN`
- `CLIENT_ID`
- `MONGO_URI`

Optional:

- `DEV_GUILD_ID` (guild-scoped slash sync in development)
- `API_PORT`
- `AI_API_KEY`

Verification (Railway/web) variables:

- `VERIFY_CHANNEL_ID` (channel where verification embed/button is posted)
- `VERIFIED_ROLE_ID` or `VERIFIED_ROLE_NAME`
- `UNVERIFIED_ROLE_ID` or `UNVERIFIED_ROLE_NAME`
- `BASE_URL` (for example: `https://your-app.up.railway.app`)
- `RECAPTCHA_SITE_KEY`
- `RECAPTCHA_SECRET_KEY`
- `LOG_CHANNEL_ID` (optional verification logs)
- `VERIFY_TOKEN_TTL_SEC` (default `600`, must be `300-900`)
- `VERIFY_BUTTON_COOLDOWN_SEC` (default `15`)

Token/port compatibility:

- `DISCORD_TOKEN` is supported as an alias for `BOT_TOKEN`
- `PORT` is supported and falls back to `API_PORT`

## Command Highlights

- Admin: `/help`, `/config`, `/modules`
- Moderation: `/kick /ban /unban /timeout /untimeout /mute /unmute /warn /warnlist /purge /slowmode /lock /unlock`
- Tickets: `/ticket setup|close|add|remove`
- Economy: `/balance /daily /work /pay /shop /inventory /gamble /coinflip /eco-leaderboard`
- Leveling: `/level /rank /leaderboard /setlevelrole`
- Music: `/play /pause /skip /queue /stop /volume /music247`
- Giveaways: `/giveaway start|end|reroll|delete`
- Utility/Fun: `/ping /serverinfo /userinfo /avatar /poll /remind /math /splitvc /movevc /meme /eightball /joke /roll /trivia /askai`

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
5. Deploy. Railway provides `PORT` automatically; the app already supports it.

## Notes

- Music module defaults to disabled for new guilds; enable with `/modules enable module:music`.
- `askai` is scaffolded and intentionally guarded behind `AI_API_KEY`.
- Dashboard auth/OAuth is scaffold-only and must be hardened before production.
