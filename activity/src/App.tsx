import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AlertTriangle, LoaderCircle, Wifi, WifiOff, X } from "lucide-react";
import { BotLogo } from "./components/BotLogo";
import { PlayerPanel } from "./components/PlayerPanel";
import { SearchPanel } from "./components/SearchPanel";
import { SessionPanel } from "./components/SessionPanel";
import { Sidebar } from "./components/Sidebar";
import { useActivitySocket } from "./hooks/useActivitySocket";
import { resolveMedia, searchYouTube, uploadAudio } from "./services/api";
import { expectedPosition } from "./utils/time";

function readRecent(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem("bot7108-recent-searches") ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function App() {
  const activity = useActivitySocket();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [recent, setRecent] = useState<string[]>(readRecent);
  const [volume, setVolume] = useState(() => Number(window.localStorage.getItem("bot7108-local-volume") ?? 72));
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [, setClock] = useState(Date.now());
  const token = activity.session?.auth.sessionToken;

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, []);

  const search = useInfiniteQuery({
    queryKey: ["youtube-search", submittedQuery, token],
    queryFn: ({ pageParam }) => searchYouTube(token!, submittedQuery, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextPageToken,
    enabled: Boolean(token && submittedQuery)
  });
  const results = search.data?.pages.flatMap((page) => page.items) ?? [];

  function submitSearch() {
    const next = query.trim();
    if (!next) return;
    setSubmittedQuery(next);
    const nextRecent = [next, ...recent.filter((value) => value !== next)].slice(0, 5);
    setRecent(nextRecent);
    window.localStorage.setItem("bot7108-recent-searches", JSON.stringify(nextRecent));
  }

  function report(error: unknown) {
    setLocalError(error instanceof Error ? error.message : "Activity command failed.");
  }

  async function addResolved(url: string) {
    if (!token) return;
    try {
      const resolution = await resolveMedia(token, url);
      for (const item of resolution.items) {
        await activity.actions.add(item);
      }
    } catch (error) {
      report(error);
    }
  }

  async function upload(file: File) {
    if (!token) return;
    try {
      setUploadProgress(0);
      const media = await uploadAudio(token, file, setUploadProgress);
      await activity.actions.add(media);
    } catch (error) {
      report(error);
    } finally {
      setUploadProgress(null);
    }
  }

  function setLocalVolume(next: number) {
    setVolume(next);
    window.localStorage.setItem("bot7108-local-volume", String(next));
  }

  const identity = activity.session?.auth.identity;
  const state = activity.state;
  const canManage = Boolean(identity && state?.hostUserId === identity.id);
  const canAdd = Boolean(canManage || state?.collaborationEnabled);
  const progress = state ? expectedPosition(state) : 0;
  const socketError = activity.error;
  const shownError = localError ?? socketError;

  const handlers = useMemo(() => ({
    play: () => void activity.actions.play().catch(() => undefined),
    pause: (position: number) => void activity.actions.pause(position).catch(() => undefined),
    seek: (position: number) => void activity.actions.seek(position).catch(() => undefined),
    next: () => void activity.actions.next().catch(() => undefined),
    previous: () => void activity.actions.previous().catch(() => undefined),
    ended: (id: string) => void activity.actions.ended(id).catch(() => undefined),
    shuffle: (enabled: boolean) => void activity.actions.shuffle(enabled).catch(() => undefined),
    repeat: (mode: "off" | "one" | "all") => void activity.actions.repeat(mode).catch(() => undefined),
    clear: () => void activity.actions.clear().catch(() => undefined),
    reorder: (ids: string[]) => void activity.actions.reorder(ids).catch(() => undefined),
    remove: (id: string) => void activity.actions.remove(id).catch(() => undefined),
    playNext: (id: string) => void activity.actions.playNext(id).catch(() => undefined)
  }), [activity.actions]);

  if (!state || !identity || !activity.session) {
    return (
      <div className="loading-shell">
        <BotLogo />
        <LoaderCircle className="loading-spinner" size={28} />
        <h1>Connecting bot7108 Activity</h1>
        <p>{shownError ?? "Authorizing your Discord session..."}</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <BotLogo />
          <div><div className="brand-title-row"><h1>bot7108</h1><span>BETA</span></div><p>Discord Activity</p></div>
        </div>
        <div className={`connection-pill status-${activity.status}`}>
          {activity.status === "connected" ? <Wifi size={16} /> : <WifiOff size={16} />}
          <span>{activity.session.channelName ?? (activity.session.source === "discord" ? "Discord voice session" : "Local preview")}</span>
        </div>
      </header>

      {shownError ? (
        <div className="error-toast" role="alert">
          <AlertTriangle size={18} /><span>{shownError}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => { setLocalError(null); activity.actions.dismissError(); }}><X size={17} /></button>
        </div>
      ) : null}

      <div className="activity-grid">
        <Sidebar query={query} onQueryChange={setQuery} onSearch={submitSearch} onResolve={addResolved} onUpload={upload} uploadProgress={uploadProgress} recent={recent} disabled={!canAdd} />
        <PlayerPanel
          state={state}
          progress={progress}
          volume={volume}
          canManage={canManage}
          canAdd={canAdd}
          onPlay={handlers.play}
          onPause={handlers.pause}
          onSeek={handlers.seek}
          onNext={handlers.next}
          onPrevious={handlers.previous}
          onEnded={handlers.ended}
          onShuffle={handlers.shuffle}
          onRepeat={handlers.repeat}
          onClear={handlers.clear}
          onReorder={handlers.reorder}
          onRemove={handlers.remove}
          onPlayNext={handlers.playNext}
          onError={setLocalError}
        />
        <SearchPanel
          items={results}
          loading={search.isFetching}
          error={search.error instanceof Error ? search.error.message : undefined}
          searched={Boolean(submittedQuery)}
          canAdd={canAdd}
          hasMore={Boolean(search.hasNextPage)}
          onAdd={(item) => void activity.actions.add(item).catch(() => undefined)}
          onMore={() => void search.fetchNextPage()}
        />
        <SessionPanel
          state={state}
          identity={identity}
          status={activity.status}
          progress={progress}
          volume={volume}
          onVolume={setLocalVolume}
          onCollaboration={(enabled) => void activity.actions.collaboration(enabled).catch(() => undefined)}
          onTransferHost={(userId) => void activity.actions.transferHost(userId).catch(() => undefined)}
        />
      </div>
    </div>
  );
}
