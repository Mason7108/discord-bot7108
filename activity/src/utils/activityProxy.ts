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

export function youtubeIframeApiUrl(hostname = window.location.hostname): string {
  return isDiscordActivityProxy(hostname) ? "/youtube/iframe_api" : "https://www.youtube.com/iframe_api";
}

export function youtubePlayerHost(
  hostname = window.location.hostname,
  origin = window.location.origin
): string {
  return isDiscordActivityProxy(hostname) ? `${origin}/youtube` : "https://www.youtube.com";
}
