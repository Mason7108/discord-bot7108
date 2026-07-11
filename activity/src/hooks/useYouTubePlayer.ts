import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityQueueItem, ActivitySessionState } from "../types/activity";
import { youtubeEmbedUrl } from "../utils/activityProxy";
import { expectedPosition } from "../utils/time";

type PlayerState = -1 | 0 | 1 | 2 | 3 | 5;
type PlayerMessage = {
  event?: "onReady" | "onStateChange" | "onError" | "infoDelivery";
  info?: PlayerState | { currentTime?: number; duration?: number; playerState?: PlayerState };
};

type Options = {
  item?: ActivityQueueItem;
  state: ActivitySessionState;
  volume: number;
  canControl: boolean;
  onPlay: () => void;
  onPause: (position: number) => void;
  onEnded: (queueItemId: string) => void;
  onError: (message: string) => void;
};

function parseMessage(data: unknown): PlayerMessage | undefined {
  try {
    return (typeof data === "string" ? JSON.parse(data) : data) as PlayerMessage;
  } catch {
    return undefined;
  }
}

export function useYouTubePlayer(options: Options) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const currentTimeRef = useRef(0);
  const playerStateRef = useRef<PlayerState>(-1);
  const suppressUntil = useRef(0);
  const latest = useRef(options);
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"synced" | "correcting" | "waiting">("waiting");
  latest.current = options;

  const post = useCallback((message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(message), "*");
  }, []);

  const command = useCallback((func: string, args: unknown[] = []) => {
    post({ event: "command", func, args, id: "bot7108-youtube-player" });
  }, [post]);

  useEffect(() => {
    const container = containerRef.current;
    const item = options.item;
    if (!container || !item || item.playbackKind !== "youtube") return;

    setReady(false);
    setSyncStatus("waiting");
    currentTimeRef.current = expectedPosition(options.state);
    playerStateRef.current = -1;

    const iframe = document.createElement("iframe");
    iframe.id = "bot7108-youtube-player";
    iframe.title = `YouTube player: ${item.title}`;
    iframe.src = youtubeEmbedUrl(item.sourceId, currentTimeRef.current);
    iframe.allow = "autoplay; encrypted-media; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "origin-when-cross-origin";
    iframeRef.current = iframe;
    container.replaceChildren(iframe);

    const listen = () => post({ event: "listening", id: "bot7108-youtube-player" });
    iframe.addEventListener("load", listen);
    const listeningInterval = window.setInterval(listen, 500);

    const receive = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) return;
      const message = parseMessage(event.data);
      if (!message?.event) return;

      if (message.event === "onReady") {
        setReady(true);
        command("setVolume", [latest.current.volume]);
        if (latest.current.state.playing) command("playVideo");
      } else if (message.event === "infoDelivery" && typeof message.info === "object") {
        if (typeof message.info.currentTime === "number") currentTimeRef.current = message.info.currentTime;
        if (typeof message.info.playerState === "number") playerStateRef.current = message.info.playerState;
      } else if (message.event === "onStateChange" && typeof message.info === "number") {
        playerStateRef.current = message.info;
        const current = latest.current;
        if (Date.now() < suppressUntil.current || !current.canControl) return;
        if (message.info === 1 && !current.state.playing) current.onPlay();
        if (message.info === 2 && current.state.playing) current.onPause(currentTimeRef.current);
        if (message.info === 0 && current.item) current.onEnded(current.item.queueItemId);
      } else if (message.event === "onError") {
        latest.current.onError("YouTube could not play this embedded video.");
      }
    };
    window.addEventListener("message", receive);

    return () => {
      window.clearInterval(listeningInterval);
      window.removeEventListener("message", receive);
      iframe.remove();
      iframeRef.current = null;
    };
  }, [command, options.item?.sourceId, options.item?.playbackKind, post]);

  useEffect(() => {
    if (ready) command("setVolume", [options.volume]);
  }, [command, options.volume, ready]);

  useEffect(() => {
    if (!ready || options.item?.playbackKind !== "youtube") return;
    const synchronize = () => {
      const expected = expectedPosition(latest.current.state);
      const drift = Math.abs(currentTimeRef.current - expected);
      suppressUntil.current = Date.now() + 900;
      if (drift > 1.5) {
        setSyncStatus("correcting");
        command("seekTo", [expected, true]);
      } else {
        setSyncStatus("synced");
      }
      if (latest.current.state.playing && playerStateRef.current !== 1) command("playVideo");
      if (!latest.current.state.playing && playerStateRef.current === 1) command("pauseVideo");
    };
    synchronize();
    const interval = window.setInterval(synchronize, 3000);
    return () => window.clearInterval(interval);
  }, [command, ready, options.item?.sourceId, options.item?.playbackKind]);

  const seekLocal = useCallback((seconds: number) => {
    suppressUntil.current = Date.now() + 1000;
    currentTimeRef.current = seconds;
    command("seekTo", [seconds, true]);
  }, [command]);

  return { containerRef, ready, syncStatus, seekLocal };
}
