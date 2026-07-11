import { describe, expect, it } from "vitest";
import { ActivityCommandError, MusicActivityService, expectedPosition } from "../../src/api/musicActivity/service.js";
import type { ActivityIdentity, ActivityMediaItem } from "../../src/api/musicActivity/types.js";

function identity(id: string, roomId = "room-a"): ActivityIdentity {
  return { id, username: id, roomId, expiresAt: Date.now() + 60_000 };
}

function media(id: string): ActivityMediaItem {
  return {
    id: `youtube:${id}`,
    source: "youtube",
    sourceId: id.padEnd(11, "x").slice(0, 11),
    playbackKind: "youtube",
    title: `Video ${id}`,
    creator: "Channel",
    durationSeconds: 180,
    url: `https://www.youtube.com/watch?v=${id.padEnd(11, "x").slice(0, 11)}`,
    embeddable: true
  };
}

describe("MusicActivityService", () => {
  it("isolates sessions and makes the first participant host", () => {
    const service = new MusicActivityService();
    const first = service.join(identity("one", "room-a"), "socket-a");
    const secondRoom = service.join(identity("two", "room-b"), "socket-b");
    service.add(identity("one", "room-a"), media("a"));

    expect(first.hostUserId).toBe("one");
    expect(secondRoom.hostUserId).toBe("two");
    expect(service.getState(identity("two", "room-b")).nowPlaying).toBeUndefined();
  });

  it("enforces host playback and collaboration permissions", () => {
    const service = new MusicActivityService();
    const host = identity("host");
    const listener = identity("listener");
    service.join(host, "host-socket");
    service.join(listener, "listener-socket");
    service.add(listener, media("a"));

    expect(() => service.play(listener)).toThrowError(ActivityCommandError);
    service.setCollaboration(host, false);
    expect(() => service.add(listener, media("b"))).toThrowError(/disabled collaborative/);
  });

  it("transfers host when the host disconnects", () => {
    const service = new MusicActivityService();
    const host = identity("host");
    const listener = identity("listener");
    service.join(host, "host-socket");
    service.join(listener, "listener-socket");

    const state = service.leave(host, "host-socket");
    expect(state.hostUserId).toBe("listener");
    expect(state.listeners.find((item) => item.id === "listener")?.host).toBe(true);
  });

  it("reorders the complete queue and rejects incomplete orders", () => {
    const service = new MusicActivityService();
    const host = identity("host");
    service.join(host, "host-socket");
    service.add(host, media("a"));
    service.add(host, media("b"));
    service.add(host, media("c"));
    const before = service.getState(host).queue;
    const reversed = before.map((item) => item.queueItemId).reverse();

    expect(service.reorder(host, reversed).queue.map((item) => item.queueItemId)).toEqual(reversed);
    expect(() => service.reorder(host, reversed.slice(1))).toThrowError(/every current queue item/);
  });

  it("restores queue state after every client disconnects and reconnects", () => {
    const service = new MusicActivityService();
    const host = identity("host");
    service.join(host, "socket-1");
    service.add(host, media("a"));
    service.add(host, media("b"));
    service.leave(host, "socket-1");

    const restored = service.join(host, "socket-2");
    expect(restored.nowPlaying?.title).toBe("Video a");
    expect(restored.queue).toHaveLength(1);
    expect(restored.hostUserId).toBe("host");
  });
});

describe("playback timestamps", () => {
  it("calculates the server-authoritative expected position", () => {
    expect(expectedPosition({ playing: true, positionSeconds: 42.5, updatedAt: 1_000, durationSeconds: 120 }, 3_500)).toBe(45);
    expect(expectedPosition({ playing: false, positionSeconds: 42.5, updatedAt: 1_000, durationSeconds: 120 }, 30_000)).toBe(42.5);
    expect(expectedPosition({ playing: true, positionSeconds: 119, updatedAt: 1_000, durationSeconds: 120 }, 10_000)).toBe(120);
  });
});
