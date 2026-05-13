import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface InviteGeneratorMessageState {
  guildId: string;
  channelId: string;
  messageId: string;
  updatedAt: string;
}

const STATE_PATH = path.join(process.cwd(), "data", "invite-generator-message.json");

export async function loadInviteGeneratorMessageState(): Promise<InviteGeneratorMessageState | null> {
  try {
    const raw = await readFile(STATE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<InviteGeneratorMessageState>;

    if (
      typeof parsed.guildId !== "string" ||
      typeof parsed.channelId !== "string" ||
      typeof parsed.messageId !== "string" ||
      typeof parsed.updatedAt !== "string"
    ) {
      return null;
    }

    return parsed as InviteGeneratorMessageState;
  } catch {
    return null;
  }
}

export async function saveInviteGeneratorMessageState(state: Omit<InviteGeneratorMessageState, "updatedAt">): Promise<void> {
  const payload: InviteGeneratorMessageState = {
    ...state,
    updatedAt: new Date().toISOString()
  };

  await mkdir(path.dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify(payload, null, 2), "utf8");
}
