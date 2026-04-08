import { Collection } from "discord.js";
import type { CooldownStore } from "../types.js";

export function checkAndSetCooldown(
  store: CooldownStore,
  commandName: string,
  userId: string,
  cooldownSec = 0
): { ok: true } | { ok: false; msRemaining: number } {
  if (cooldownSec <= 0) {
    return { ok: true };
  }

  const now = Date.now();
  const cooldownMs = cooldownSec * 1_000;

  if (!store.has(commandName)) {
    store.set(commandName, new Collection());
  }

  const commandCooldowns = store.get(commandName)!;
  const lastRun = commandCooldowns.get(userId);

  if (lastRun && now - lastRun < cooldownMs) {
    return { ok: false, msRemaining: cooldownMs - (now - lastRun) };
  }

  commandCooldowns.set(userId, now);
  return { ok: true };
}
