import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface VerifyMessageState {
  guildId: string;
  channelId: string;
  messageId: string;
  updatedAt: string;
}

const STATE_PATH = path.join(process.cwd(), "data", "verify-message.json");

export async function loadVerifyMessageState(): Promise<VerifyMessageState | null> {
  try {
    const raw = await readFile(STATE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<VerifyMessageState>;

    if (
      typeof parsed.guildId !== "string" ||
      typeof parsed.channelId !== "string" ||
      typeof parsed.messageId !== "string" ||
      typeof parsed.updatedAt !== "string"
    ) {
      return null;
    }

    return parsed as VerifyMessageState;
  } catch {
    return null;
  }
}

export async function saveVerifyMessageState(state: Omit<VerifyMessageState, "updatedAt">): Promise<void> {
  const payload: VerifyMessageState = {
    ...state,
    updatedAt: new Date().toISOString()
  };

  await mkdir(path.dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify(payload, null, 2), "utf8");
}
