import type { ActivitySessionState } from "../types/activity";

export function expectedPosition(state: Pick<ActivitySessionState, "playing" | "positionSeconds" | "updatedAt" | "durationSeconds">, now = Date.now()): number {
  const elapsed = state.playing ? Math.max(0, now - state.updatedAt) / 1000 : 0;
  return Math.min(Math.max(state.positionSeconds + elapsed, 0), state.durationSeconds);
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`;
}
