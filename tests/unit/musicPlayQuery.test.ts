import { describe, expect, it } from "vitest";
import { normalizePlayQuery } from "../../src/modules/music/commands/play.js";

describe("normalizePlayQuery", () => {
  it("keeps explicit YouTube playlist links intact", () => {
    const playlistUrl = "https://www.youtube.com/watch?v=abc12345678&list=PL1234567890abcdef&index=3";

    expect(normalizePlayQuery(playlistUrl)).toBe(playlistUrl);
  });

  it("keeps YouTube playlist page URLs intact", () => {
    const playlistUrl = "https://www.youtube.com/playlist?list=PL1234567890abcdef";

    expect(normalizePlayQuery(playlistUrl)).toBe(playlistUrl);
  });

  it("still strips YouTube radio links down to the selected video", () => {
    expect(normalizePlayQuery("https://www.youtube.com/watch?v=abc12345678&list=RDabc12345678&start_radio=1")).toBe(
      "https://www.youtube.com/watch?v=abc12345678"
    );
  });

  it("normalizes short YouTube links without playlist metadata", () => {
    expect(normalizePlayQuery("https://youtu.be/abc12345678?si=ignored")).toBe("https://youtu.be/abc12345678");
  });
});
