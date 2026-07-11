import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../src/config/env.js";
import { SpotifyService, parseSpotifyUrl } from "../../src/api/musicActivity/spotify.js";
import { isSupportedAudioFile, safeUploadFilename } from "../../src/api/musicActivity/uploads.js";
import { parseIsoDuration, parseYouTubePlaylistId, parseYouTubeVideoId, YouTubeService } from "../../src/api/musicActivity/youtube.js";

afterEach(() => vi.unstubAllGlobals());

describe("Activity media parsing", () => {
  it("parses supported YouTube URLs and rejects lookalike hosts", () => {
    expect(parseYouTubeVideoId(new URL("https://www.youtube.com/watch?v=dQw4w9WgXcQ"))).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeVideoId(new URL("https://youtu.be/dQw4w9WgXcQ"))).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeVideoId(new URL("https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ"))).toBeUndefined();
  });

  it("parses ISO 8601 video durations", () => {
    expect(parseIsoDuration("PT3M45S")).toBe(225);
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
  });

  it("parses supported YouTube playlist URLs and rejects lookalike hosts", () => {
    expect(parseYouTubePlaylistId(new URL("https://www.youtube.com/playlist?list=PL1234567890abcdef"))).toBe("PL1234567890abcdef");
    expect(parseYouTubePlaylistId(new URL("https://youtube.com.evil.test/playlist?list=PL1234567890abcdef"))).toBeUndefined();
  });

  it("resolves public embeddable playlist videos in order", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [
          { contentDetails: { videoId: "M7lc1UVf-VE" } },
          { contentDetails: { videoId: "dQw4w9WgXcQ" } }
        ] })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [
          {
            id: "M7lc1UVf-VE",
            snippet: { title: "First", channelTitle: "Channel", thumbnails: {} },
            contentDetails: { duration: "PT1M" },
            status: { embeddable: true, privacyStatus: "public" }
          },
          {
            id: "dQw4w9WgXcQ",
            snippet: { title: "Second", channelTitle: "Channel", thumbnails: {} },
            contentDetails: { duration: "PT2M" },
            status: { embeddable: true, privacyStatus: "public" }
          }
        ] })
      });
    vi.stubGlobal("fetch", fetchMock);
    const items = await new YouTubeService({ YOUTUBE_API_KEY: "key" } as Env).getPlaylist("PL1234567890abcdef");

    expect(items.map((item) => item.title)).toEqual(["First", "Second"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("parses only supported Spotify metadata URLs", () => {
    expect(parseSpotifyUrl(new URL("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"))).toEqual({ type: "track", id: "4uLU6hMCjMI75M1A2tKUQC" });
    expect(parseSpotifyUrl(new URL("https://open.spotify.com.evil.test/track/4uLU6hMCjMI75M1A2tKUQC"))).toBeUndefined();
  });

  it("marks resolved Spotify tracks as metadata-only", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "token", expires_in: 3600 }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "4uLU6hMCjMI75M1A2tKUQC",
          name: "Metadata Track",
          duration_ms: 200000,
          type: "track",
          artists: [{ name: "Artist" }],
          album: { name: "Album", images: [{ url: "https://i.scdn.co/image/example" }] },
          external_urls: { spotify: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC" }
        })
      });
    vi.stubGlobal("fetch", fetchMock);
    const service = new SpotifyService({ SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret" } as Env);
    const item = await service.resolve(new URL("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"));

    expect(item.playbackKind).toBe("none");
    expect(item.metadataOnly).toBe(true);
    expect(item.source).toBe("spotify");
  });
});

describe("Activity upload validation", () => {
  it("requires both an allowed extension and MIME type", () => {
    expect(isSupportedAudioFile("track.mp3", "audio/mpeg")).toBe(true);
    expect(isSupportedAudioFile("track.exe", "audio/mpeg")).toBe(false);
    expect(isSupportedAudioFile("track.mp3", "application/x-msdownload")).toBe(false);
  });

  it("generates filenames without user-controlled path segments", () => {
    const generated = safeUploadFilename("../../unsafe.mp3");
    expect(path.extname(generated)).toBe(".mp3");
    expect(generated).not.toContain("unsafe");
    expect(generated).not.toContain("..");
  });
});
