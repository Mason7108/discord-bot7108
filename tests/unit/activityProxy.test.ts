import { describe, expect, it } from "vitest";
import {
  activityMediaUrl,
  isDiscordActivityProxy,
  youtubeIframeApiUrl,
  youtubePlayerHost
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
    expect(youtubeIframeApiUrl("localhost")).toBe("https://www.youtube.com/iframe_api");
    expect(youtubePlayerHost("localhost", "http://localhost:5173")).toBe("https://www.youtube.com");
  });

  it("routes the official player through the Activity proxy", () => {
    const hostname = "1474958097758814279.discordsays.com";
    const origin = `https://${hostname}`;
    expect(youtubeIframeApiUrl(hostname)).toBe("/youtube/iframe_api");
    expect(youtubePlayerHost(hostname, origin)).toBe(`${origin}/youtube`);
  });
});
