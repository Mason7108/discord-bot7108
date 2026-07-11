import { authenticateDevelopment, authenticateDiscord } from "./api";
import type { ResolvedActivitySession } from "../types/activity";

type DiscordSdkLike = {
  ready: () => Promise<void>;
  guildId?: string | null;
  channelId?: string | null;
  instanceId?: string | null;
  commands: {
    authorize: (args: {
      client_id: string;
      response_type: "code";
      state: string;
      prompt: "none" | "consent";
      scope: string[];
    }) => Promise<{ code: string }>;
    authenticate: (args: { access_token: string }) => Promise<unknown>;
    getChannel: (args: { channel_id: string }) => Promise<{ name?: string | null }>;
    openInviteDialog?: () => Promise<void>;
  };
};

function isEmbedded(): boolean {
  try {
    return window.self !== window.top || new URLSearchParams(window.location.search).has("frame_id");
  } catch {
    return true;
  }
}

function browserIdentity(): { userId: string; username: string; scope: string } {
  const params = new URLSearchParams(window.location.search);
  const storedId = window.localStorage.getItem("bot7108-preview-user");
  const userId = storedId ?? crypto.randomUUID();
  if (!storedId) {
    window.localStorage.setItem("bot7108-preview-user", userId);
  }
  return {
    userId,
    username: (params.get("user") || "Local listener").slice(0, 40),
    scope: (params.get("scope") || "preview").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "preview"
  };
}

async function authorize(sdk: DiscordSdkLike, clientId: string): Promise<string> {
  const request = (prompt: "none" | "consent") => sdk.commands.authorize({
    client_id: clientId,
    response_type: "code",
    state: crypto.randomUUID(),
    prompt,
    scope: ["identify", "guilds"]
  });
  try {
    return (await request("none")).code;
  } catch {
    return (await request("consent")).code;
  }
}

export async function resolveActivitySession(): Promise<ResolvedActivitySession> {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
  if (!clientId || !isEmbedded()) {
    return {
      auth: await authenticateDevelopment(browserIdentity()),
      channelName: "Local preview",
      source: "browser"
    };
  }

  const { DiscordSDK } = await import("@discord/embedded-app-sdk");
  const sdk = new DiscordSDK(clientId) as unknown as DiscordSdkLike;
  await sdk.ready();
  if (!sdk.guildId || !sdk.channelId || !sdk.instanceId) {
    throw new Error("Open bot7108 Activity from a server voice channel.");
  }
  const auth = await authenticateDiscord({
    code: await authorize(sdk, clientId),
    guildId: sdk.guildId,
    channelId: sdk.channelId,
    instanceId: sdk.instanceId
  });
  if (auth.discordAccessToken) {
    await sdk.commands.authenticate({ access_token: auth.discordAccessToken });
  }
  let channelName: string | undefined;
  try {
    channelName = (await sdk.commands.getChannel({ channel_id: sdk.channelId })).name ?? undefined;
  } catch {
    channelName = undefined;
  }
  return { auth, channelName, source: "discord" };
}
