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

## Command Highlights

- Admin: `/help`, `/config`, `/modules`
- Moderation: `/kick /ban /unban /timeout /untimeout /mute /unmute /warn /warnlist /purge /slowmode /lock /unlock`
- Tickets: `/ticket setup|close|add|remove`
- Economy: `/balance /daily /work /pay /shop /inventory /gamble /coinflip /eco-leaderboard`
- Leveling: `/level /rank /leaderboard /setlevelrole`
- Music: `/play /pause /skip /queue /stop /volume /music247`
- Giveaways: `/giveaway start|end|reroll|delete`
- Utility/Fun: `/ping /serverinfo /userinfo /avatar /poll /remind /math /splitvc /meme /eightball /joke /roll /trivia /askai`

## Notes

- Music module defaults to disabled for new guilds; enable with `/modules enable module:music`.
- `askai` is scaffolded and intentionally guarded behind `AI_API_KEY`.
- Dashboard auth/OAuth is scaffold-only and must be hardened before production.
