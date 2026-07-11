import { readFile } from "node:fs/promises";
import { io } from "socket.io-client";

const scope = process.argv[2] || "e2e";
const source = process.argv[3] || "data/activity-sync-test.wav";

async function readData(response) {
  const body = await response.json();
  if (!response.ok || !body.ok) {
    throw new Error(body.ok ? `Request failed (${response.status})` : body.error.message);
  }
  return body.data;
}

const auth = await readData(await fetch("http://localhost:3000/api/auth/dev", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ scope, userId: `e2e-uploader-${Date.now()}`, username: "E2E uploader" })
}));

let media;
if (source === "youtube") {
  media = await readData(await fetch("http://localhost:3000/api/dev/youtube-fixture", {
    headers: { Authorization: `Bearer ${auth.sessionToken}` }
  }));
} else {
  const form = new FormData();
  form.set("file", new Blob([await readFile(source)], { type: "audio/wav" }), "activity-sync-test.wav");
  media = await readData(await fetch("http://localhost:3000/api/uploads", {
    method: "POST",
    headers: { Authorization: `Bearer ${auth.sessionToken}` },
    body: form
  }));
}

const socket = io("http://localhost:3000", {
  path: "/socket.io",
  transports: ["websocket"],
  auth: { sessionToken: auth.sessionToken }
});

function emit(event, payload) {
  return new Promise((resolve, reject) => {
    const ack = (response) => response.ok ? resolve(response.data) : reject(new Error(response.error.message));
    if (payload === undefined) socket.emit(event, ack);
    else socket.emit(event, payload, ack);
  });
}

await new Promise((resolve, reject) => {
  socket.once("connect", resolve);
  socket.once("connect_error", reject);
});
await emit("session:join");
const state = await emit("queue:add", { item: media });
socket.disconnect();

console.log(JSON.stringify({
  ok: true,
  roomId: state.roomId,
  nowPlaying: state.nowPlaying?.title,
  playbackKind: state.nowPlaying?.playbackKind,
  listenerCount: state.listeners.length
}));
