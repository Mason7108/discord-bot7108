export function parseDurationToMs(input: string): number | null {
  const normalized = input.trim().toLowerCase();
  const match = normalized.match(/^(\d+)(s|m|h|d)$/);

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2];

  const multiplier: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000
  };

  return amount * multiplier[unit];
}

export function msToHuman(inputMs: number): string {
  const totalSeconds = Math.floor(inputMs / 1_000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(" ");
}
