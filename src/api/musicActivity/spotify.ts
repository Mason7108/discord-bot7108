import type { Env } from "../../config/env.js";
import type { ActivityMediaItem } from "./types.js";

type SpotifyToken = { access_token?: string; expires_in?: number };
type SpotifyImage = { url?: string };
type SpotifyArtist = { name?: string };
type SpotifyItem = {
  id?: string;
  name?: string;
  type?: string;
  duration_ms?: number;
  external_urls?: { spotify?: string };
  images?: SpotifyImage[];
  album?: { name?: string; images?: SpotifyImage[] };
  artists?: SpotifyArtist[];
  owner?: { display_name?: string };
};

export class SpotifyService {
  private accessToken?: { value: string; expiresAt: number };

  constructor(private readonly env: Env) {}

  get configured(): boolean {
    return Boolean(this.env.SPOTIFY_CLIENT_ID && this.env.SPOTIFY_CLIENT_SECRET);
  }

  async resolve(url: URL): Promise<ActivityMediaItem> {
    if (!this.configured) {
      throw new Error("Spotify metadata requires SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET on the server.");
    }
    const parsed = parseSpotifyUrl(url);
    if (!parsed) {
      throw new Error("Use a Spotify track, album, or playlist URL.");
    }
    const response = await fetch(`https://api.spotify.com/v1/${parsed.type}s/${parsed.id}`, {
      headers: { Authorization: `Bearer ${await this.getAccessToken()}` }
    });
    const item = (await response.json()) as SpotifyItem;
    if (!response.ok || !item.id || !item.name) {
      throw new Error("Spotify metadata could not be loaded for that link.");
    }
    const creator = parsed.type === "playlist"
      ? item.owner?.display_name ?? "Spotify playlist"
      : item.artists?.map((artist) => artist.name).filter(Boolean).join(", ") || "Spotify";
    const images = item.album?.images ?? item.images;
    return {
      id: `spotify:${parsed.type}:${item.id}`,
      source: "spotify",
      sourceId: item.id,
      playbackKind: "none",
      title: item.name,
      creator,
      collection: item.album?.name,
      thumbnailUrl: images?.[0]?.url,
      durationSeconds: Math.round((item.duration_ms ?? 0) / 1000),
      url: item.external_urls?.spotify ?? url.toString(),
      metadataOnly: true
    };
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 30_000) {
      return this.accessToken.value;
    }
    const credentials = Buffer.from(`${this.env.SPOTIFY_CLIENT_ID}:${this.env.SPOTIFY_CLIENT_SECRET}`).toString("base64");
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials" })
    });
    const body = (await response.json()) as SpotifyToken;
    if (!response.ok || !body.access_token) {
      throw new Error("Spotify authentication failed.");
    }
    this.accessToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return body.access_token;
  }
}

export function parseSpotifyUrl(url: URL): { type: "track" | "album" | "playlist"; id: string } | undefined {
  if (url.hostname.toLowerCase() !== "open.spotify.com") {
    return undefined;
  }
  const [type, id] = url.pathname.split("/").filter(Boolean);
  if (!(["track", "album", "playlist"] as string[]).includes(type) || !/^[A-Za-z0-9]{16,32}$/.test(id ?? "")) {
    return undefined;
  }
  return { type: type as "track" | "album" | "playlist", id };
}
