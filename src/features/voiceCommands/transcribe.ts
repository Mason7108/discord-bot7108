import { loadEnv, type Env } from "../../config/env.js";

const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";
const PCM_SAMPLE_RATE = 48_000;
const PCM_CHANNELS = 2;
const PCM_BITS_PER_SAMPLE = 16;

export interface VoiceRecognitionStatus {
  ok: boolean;
  reason?: string;
}

function getOpenAiApiKey(env: Env): string | undefined {
  return env.VOICE_COMMANDS_OPENAI_API_KEY ?? env.OPENAI_API_KEY;
}

export function getVoiceRecognitionStatus(env = loadEnv()): VoiceRecognitionStatus {
  if (!getOpenAiApiKey(env)) {
    return {
      ok: false,
      reason: "Voice recognition is unavailable. Set VOICE_COMMANDS_OPENAI_API_KEY or OPENAI_API_KEY, then restart the bot."
    };
  }

  return { ok: true };
}

export function pcmToWavBuffer(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = (PCM_SAMPLE_RATE * PCM_CHANNELS * PCM_BITS_PER_SAMPLE) / 8;
  const blockAlign = (PCM_CHANNELS * PCM_BITS_PER_SAMPLE) / 8;

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(PCM_CHANNELS, 22);
  header.writeUInt32LE(PCM_SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(PCM_BITS_PER_SAMPLE, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

export async function transcribePcmAudio(pcm: Buffer, env = loadEnv()): Promise<string> {
  const apiKey = getOpenAiApiKey(env);
  if (!apiKey) {
    throw new Error("Voice recognition is unavailable. Set VOICE_COMMANDS_OPENAI_API_KEY or OPENAI_API_KEY.");
  }

  const wav = pcmToWavBuffer(pcm);
  const wavArrayBuffer = wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) as ArrayBuffer;
  const form = new FormData();
  form.append("model", env.VOICE_COMMANDS_STT_MODEL);
  form.append("response_format", "json");
  form.append("file", new Blob([wavArrayBuffer], { type: "audio/wav" }), "voice-command.wav");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.VOICE_COMMANDS_TRANSCRIBE_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: form,
      signal: controller.signal
    });

    const payload = (await response.json().catch(() => ({}))) as {
      text?: unknown;
      error?: { message?: unknown };
    };

    if (!response.ok) {
      const reason = typeof payload.error?.message === "string" ? payload.error.message : `HTTP ${response.status}`;
      throw new Error(`Speech-to-text request failed: ${reason}`);
    }

    if (typeof payload.text !== "string") {
      throw new Error("Speech-to-text response did not include transcript text.");
    }

    return payload.text.trim();
  } finally {
    clearTimeout(timeout);
  }
}
