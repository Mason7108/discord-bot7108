import { describe, expect, it } from "vitest";
import { pcmToWavBuffer } from "../../src/features/voiceCommands/transcribe.js";

describe("pcmToWavBuffer", () => {
  it("wraps PCM data in an in-memory wav container", () => {
    const pcm = Buffer.alloc(1920);
    const wav = pcmToWavBuffer(pcm);

    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.subarray(8, 12).toString("ascii")).toBe("WAVE");
    expect(wav.subarray(36, 40).toString("ascii")).toBe("data");
    expect(wav.readUInt32LE(40)).toBe(pcm.length);
    expect(wav.length).toBe(44 + pcm.length);
  });
});
