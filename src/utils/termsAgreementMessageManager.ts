import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface TermsAgreementMessageState {
  guildId: string;
  channelId: string;
  messageId: string;
  updatedAt: string;
}

const STATE_PATH = path.join(process.cwd(), "data", "terms-agreement-message.json");

export async function loadTermsAgreementMessageState(): Promise<TermsAgreementMessageState | null> {
  try {
    const raw = await readFile(STATE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<TermsAgreementMessageState>;

    if (
      typeof parsed.guildId !== "string" ||
      typeof parsed.channelId !== "string" ||
      typeof parsed.messageId !== "string" ||
      typeof parsed.updatedAt !== "string"
    ) {
      return null;
    }

    return parsed as TermsAgreementMessageState;
  } catch {
    return null;
  }
}

export async function saveTermsAgreementMessageState(state: Omit<TermsAgreementMessageState, "updatedAt">): Promise<void> {
  const payload: TermsAgreementMessageState = {
    ...state,
    updatedAt: new Date().toISOString()
  };

  await mkdir(path.dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify(payload, null, 2), "utf8");
}
