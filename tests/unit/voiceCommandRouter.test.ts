import { describe, expect, it } from "vitest";
import { parseVoiceCommandTranscript } from "../../src/features/voiceCommands/voiceCommandRouter.js";

describe("parseVoiceCommandTranscript", () => {
  it("requires the bot7108 wake phrase", () => {
    expect(parseVoiceCommandTranscript("play something")).toEqual({ ok: false, reason: "missing_wake_phrase" });
  });

  it("parses spoken play commands", () => {
    expect(parseVoiceCommandTranscript("hey bot7108 play never gonna give you up")).toEqual({
      ok: true,
      commandName: "play",
      query: "never gonna give you up",
      commandText: "play never gonna give you up"
    });
  });

  it("accepts bot 7108 as a speech-to-text spelling variant", () => {
    expect(parseVoiceCommandTranscript("Hey bot 7108 pause")).toEqual({
      ok: true,
      commandName: "pause",
      commandText: "pause"
    });
  });

  it("rejects play commands without a query", () => {
    expect(parseVoiceCommandTranscript("hey bot7108 play")).toEqual({
      ok: false,
      reason: "missing_query",
      commandText: "play"
    });
  });

  it("parses supported transport commands", () => {
    for (const commandName of ["resume", "skip", "stop", "leave"] as const) {
      expect(parseVoiceCommandTranscript(`hey bot7108 ${commandName}`)).toEqual({
        ok: true,
        commandName,
        commandText: commandName
      });
    }
  });
});
