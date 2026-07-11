const DISCORD_PROXY_SUFFIX = ".discordsays.com";

export function isDiscordActivityProxy(hostname = window.location.hostname): boolean {
  return hostname.endsWith(DISCORD_PROXY_SUFFIX);
}

export function activityMediaUrl(rawUrl: string, hostname = window.location.hostname): string {
  if (!isDiscordActivityProxy(hostname)) return rawUrl;

  try {
    const url = new URL(rawUrl);
    if (url.hostname === "i.ytimg.com") {
      return `/ytimg${url.pathname}${url.search}`;
    }
  } catch {
    return rawUrl;
  }

  return rawUrl;
}

export function youtubeEmbedUrl(
  videoId: string,
  startSeconds: number,
  hostname = window.location.hostname,
  origin = window.location.origin
): string {
  const base = isDiscordActivityProxy(hostname)
    ? `${origin}/youtube/embed/${encodeURIComponent(videoId)}`
    : `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;
  const url = new URL(base);
  url.searchParams.set("enablejsapi", "1");
  url.searchParams.set("controls", "1");
  url.searchParams.set("playsinline", "1");
  url.searchParams.set("rel", "0");
  url.searchParams.set("origin", origin);
  if (startSeconds > 0) url.searchParams.set("start", String(Math.floor(startSeconds)));
  return url.toString();
}
