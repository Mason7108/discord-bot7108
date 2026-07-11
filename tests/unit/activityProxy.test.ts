import { describe, expect, it } from "vitest";
import {
  activityMediaUrl,
  isDiscordActivityProxy,
  youtubeEmbedUrl
} from "../../activity/src/utils/activityProxy";

describe("Discord Activity proxy URLs", () => {
  it("detects only the Discord Activity proxy domain", () => {
    expect(isDiscordActivityProxy("1474958097758814279.discordsays.com")).toBe(true);
    expect(isDiscordActivityProxy("discordsays.com.evil.test")).toBe(false);
  });

  it("maps YouTube thumbnails inside Discord", () => {
    expect(activityMediaUrl(
      "https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg",
      "1474958097758814279.discordsays.com"
    )).toBe("/ytimg/vi/M7lc1UVf-VE/hqdefault.jpg");
  });

  it("keeps direct browser URLs unchanged", () => {
    const thumbnail = "https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg";
    expect(activityMediaUrl(thumbnail, "localhost")).toBe(thumbnail);
    expect(youtubeEmbedUrl("M7lc1UVf-VE", 0, "localhost", "http://localhost:5173"))
      .toContain("https://www.youtube.com/embed/M7lc1UVf-VE");
  });

  it("routes the official player through the Activity proxy", () => {
    const hostname = "1474958097758814279.discordsays.com";
    const origin = `https://${hostname}`;
    const url = youtubeEmbedUrl("M7lc1UVf-VE", 42.5, hostname, origin);
    expect(url).toContain(`${origin}/youtube/embed/M7lc1UVf-VE`);
    expect(url).toContain("enablejsapi=1");
    expect(url).toContain("start=42");
  });
});
