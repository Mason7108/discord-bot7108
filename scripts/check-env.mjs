import { existsSync, readFileSync } from "node:fs";

function readEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return new Map();
  }

  const values = new Map();
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=(.*)$/);
    if (!match) {
      continue;
    }

    values.set(match[1], match[2].trim());
  }

  return values;
}

function hasAny(values, keys) {
  return keys.some((key) => values.has(key) && values.get(key).trim().length > 0);
}

function status(values, item) {
  const ok = hasAny(values, item.keys);
  return {
    label: item.label,
    keys: item.keys.join(" or "),
    status: ok ? "set" : item.required ? "missing" : "optional"
  };
}

const values = readEnvFile(".env");
const checks = [
  { label: "Discord bot token", keys: ["BOT_TOKEN", "DISCORD_TOKEN"], required: true },
  { label: "Discord client ID", keys: ["CLIENT_ID", "DISCORD_CLIENT_ID"], required: true },
  { label: "Discord OAuth client secret", keys: ["DISCORD_CLIENT_SECRET", "DISCORD_OAUTH_CLIENT_SECRET"], required: true },
  { label: "Mongo database", keys: ["MONGO_URI"], required: true },
  { label: "Dashboard session secret", keys: ["SESSION_SECRET"], required: true },
  { label: "Public base URL", keys: ["BASE_URL"], required: true },
  { label: "Dashboard OAuth redirect override", keys: ["DASHBOARD_DISCORD_REDIRECT_URI"], required: false },
  { label: "Support server link", keys: ["SUPPORT_SERVER_URL"], required: false },
  { label: "Bot invite permissions", keys: ["BOT_INVITE_PERMISSIONS"], required: false }
];

const rows = checks.map((item) => status(values, item));
const missing = rows.filter((row) => row.status === "missing");

console.table(rows);
if (missing.length > 0) {
  console.error(`Missing required environment groups: ${missing.map((row) => row.label).join(", ")}`);
  process.exitCode = 1;
}
