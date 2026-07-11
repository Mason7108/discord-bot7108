import type { ActivityAck, ActivityAuthResult, ActivityMediaItem, ActivitySearchPage } from "../types/activity";

async function readResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ActivityAck<T>;
  if (!response.ok || !body.ok) {
    throw new Error(body.ok ? `Request failed (${response.status}).` : body.error.message);
  }
  return body.data;
}

export async function authenticateDevelopment(input: { scope: string; userId: string; username: string }): Promise<ActivityAuthResult> {
  const response = await fetch("/api/auth/dev", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return readResponse<ActivityAuthResult>(response);
}

export async function authenticateDiscord(input: {
  code: string;
  guildId: string;
  channelId: string;
  instanceId: string;
}): Promise<ActivityAuthResult> {
  const response = await fetch("/api/auth/discord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return readResponse<ActivityAuthResult>(response);
}

export async function searchYouTube(token: string, query: string, pageToken?: string): Promise<ActivitySearchPage> {
  const params = new URLSearchParams({ q: query, limit: "8" });
  if (pageToken) {
    params.set("pageToken", pageToken);
  }
  const response = await fetch(`/api/youtube/search?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  return readResponse<ActivitySearchPage>(response);
}

export async function resolveMedia(token: string, url: string): Promise<ActivityMediaItem> {
  const response = await fetch("/api/media/resolve", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });
  return readResponse<ActivityMediaItem>(response);
}

export async function uploadAudio(
  token: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<ActivityMediaItem> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/uploads");
    request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    request.addEventListener("load", () => {
      try {
        const body = JSON.parse(request.responseText) as ActivityAck<ActivityMediaItem>;
        if (request.status >= 200 && request.status < 300 && body.ok) {
          onProgress(100);
          resolve(body.data);
        } else {
          reject(new Error(body.ok ? "Upload failed." : body.error.message));
        }
      } catch {
        reject(new Error("Upload failed."));
      }
    });
    request.addEventListener("error", () => reject(new Error("Upload failed.")));
    const form = new FormData();
    form.set("file", file);
    request.send(form);
  });
}
