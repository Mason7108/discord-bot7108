import { describe, expect, it } from "vitest";
import { normalizeVoiceTextToSpeechText } from "../../src/systems/voiceTextToSpeech.js";

describe("normalizeVoiceTextToSpeechText", () => {
  it("replaces URLs and custom emoji with speakable text", () => {
    expect(normalizeVoiceTextToSpeechText("check https://example.com <a:party:1234567890>")).toBe("check link party");
  });

  it("removes noisy markdown", () => {
    expect(normalizeVoiceTextToSpeechText("**hello** `world` > today")).toBe("hello world today");
  });

  it("truncates long messages", () => {
    expect(normalizeVoiceTextToSpeechText("abcdefghijklmnopqrstuvwxyz", 10)).toBe("abcdefg...");
  });
});
