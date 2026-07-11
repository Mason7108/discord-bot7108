import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityQueueItem, ActivitySessionState } from "../types/activity";
import { youtubeIframeApiUrl, youtubePlayerHost } from "../utils/activityProxy";
import { expectedPosition } from "../utils/time";

type PlayerState = -1 | 0 | 1 | 2 | 3 | 5;
type YouTubePlayer = {
  loadVideoById: (args: { videoId: string; startSeconds?: number }) => void;
  cueVideoById: (args: { videoId: string; startSeconds?: number }) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getPlayerState: () => PlayerState;
  setVolume: (volume: number) => void;
  destroy: () => void;
};
type PlayerEvent = { target: YouTubePlayer; data: PlayerState };
type YouTubeApi = {
  Player: new (element: HTMLElement, options: Record<string, unknown>) => YouTubePlayer;
  PlayerState: { ENDED: 0; PLAYING: 1; PAUSED: 2 };
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeApi> | undefined;

function loadApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prior?.();
      if (window.YT) resolve(window.YT);
      else reject(new Error("YouTube player API did not initialize."));
    };
    const script = document.createElement("script");
    script.src = youtubeIframeApiUrl();
    script.async = true;
    script.addEventListener("error", () => reject(new Error("YouTube player API could not be loaded.")));
    document.head.appendChild(script);
  });
  return apiPromise;
}

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

export function useYouTubePlayer(options: Options) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const loadedId = useRef<string | undefined>(undefined);
  const suppressUntil = useRef(0);
  const latest = useRef(options);
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"synced" | "correcting" | "waiting">("waiting");
  latest.current = options;

  useEffect(() => {
    const element = containerRef.current;
    if (!element || options.item?.playbackKind !== "youtube") return;
    let disposed = false;
    void loadApi().then((YT) => {
      if (disposed || playerRef.current || !containerRef.current) return;
      playerRef.current = new YT.Player(containerRef.current, {
        width: "100%",
        height: "100%",
        host: youtubePlayerHost(),
        videoId: options.item!.sourceId,
        playerVars: {
          controls: 1,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin,
          rel: 0
        },
        events: {
          onReady: (event: PlayerEvent) => {
            event.target.setVolume(latest.current.volume);
            loadedId.current = latest.current.item?.sourceId;
            setReady(true);
          },
          onStateChange: (event: PlayerEvent) => {
            const current = latest.current;
            if (Date.now() < suppressUntil.current || !current.canControl) return;
            if (event.data === YT.PlayerState.PLAYING && !current.state.playing) current.onPlay();
            if (event.data === YT.PlayerState.PAUSED && current.state.playing) current.onPause(event.target.getCurrentTime());
            if (event.data === YT.PlayerState.ENDED && current.item) current.onEnded(current.item.queueItemId);
          },
          onError: () => latest.current.onError("YouTube could not play this embedded video.")
        }
      });
    }).catch((error) => options.onError(error instanceof Error ? error.message : "YouTube player failed."));
    return () => {
      disposed = true;
    };
  }, [options.item?.playbackKind]);

  useEffect(() => {
    const player = playerRef.current;
    const item = options.item;
    if (!player || !ready || !item || item.playbackKind !== "youtube" || loadedId.current === item.sourceId) return;
    suppressUntil.current = Date.now() + 1500;
    const startSeconds = expectedPosition(options.state);
    if (options.state.playing) player.loadVideoById({ videoId: item.sourceId, startSeconds });
    else player.cueVideoById({ videoId: item.sourceId, startSeconds });
    loadedId.current = item.sourceId;
  }, [options.item?.sourceId, options.item?.playbackKind, options.state.revision, ready]);

  useEffect(() => {
    playerRef.current?.setVolume(options.volume);
  }, [options.volume]);

  useEffect(() => {
    if (!ready || options.item?.playbackKind !== "youtube") return;
    const synchronize = () => {
      const player = playerRef.current;
      if (!player) return;
      const expected = expectedPosition(latest.current.state);
      const current = player.getCurrentTime();
      const drift = Math.abs(current - expected);
      suppressUntil.current = Date.now() + 900;
      if (drift > 1.5) {
        setSyncStatus("correcting");
        player.seekTo(expected, true);
      } else {
        setSyncStatus("synced");
      }
      const playerState = player.getPlayerState();
      if (latest.current.state.playing && playerState !== 1) player.playVideo();
      if (!latest.current.state.playing && playerState === 1) player.pauseVideo();
    };
    synchronize();
    const interval = window.setInterval(synchronize, 3000);
    return () => window.clearInterval(interval);
  }, [ready, options.item?.sourceId, options.item?.playbackKind]);

  const seekLocal = useCallback((seconds: number) => {
    suppressUntil.current = Date.now() + 1000;
    playerRef.current?.seekTo(seconds, true);
  }, []);

  useEffect(() => () => {
    playerRef.current?.destroy();
    playerRef.current = null;
  }, []);

  return { containerRef, ready, syncStatus, seekLocal };
}
