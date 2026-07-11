import { useEffect, useRef } from "react";
import { Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Trash2, Video } from "lucide-react";
import { useYouTubePlayer } from "../hooks/useYouTubePlayer";
import type { ActivityRepeatMode, ActivitySessionState } from "../types/activity";
import { expectedPosition, formatTime } from "../utils/time";
import { QueueList } from "./QueueList";
import { SourceBadge } from "./MediaThumb";

type Props = {
  state: ActivitySessionState;
  progress: number;
  volume: number;
  canManage: boolean;
  canAdd: boolean;
  onPlay: () => void;
  onPause: (position: number) => void;
  onSeek: (position: number) => void;
  onNext: () => void;
  onPrevious: () => void;
  onEnded: (id: string) => void;
  onShuffle: (enabled: boolean) => void;
  onRepeat: (mode: ActivityRepeatMode) => void;
  onClear: () => void;
  onReorder: (ids: string[]) => void;
  onRemove: (id: string) => void;
  onPlayNext: (id: string) => void;
  onError: (message: string) => void;
};

function nextRepeat(mode: ActivityRepeatMode): ActivityRepeatMode {
  return mode === "off" ? "all" : mode === "all" ? "one" : "off";
}

export function PlayerPanel(props: Props) {
  const item = props.state.nowPlaying;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const suppressAudio = useRef(0);
  const youtube = useYouTubePlayer({
    item,
    state: props.state,
    volume: props.volume,
    canControl: props.canManage,
    onPlay: props.onPlay,
    onPause: props.onPause,
    onEnded: props.onEnded,
    onError: props.onError
  });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || item?.playbackKind !== "audio") return;
    audio.volume = props.volume / 100;
  }, [props.volume, item?.playbackKind]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || item?.playbackKind !== "audio") return;
    const sync = () => {
      const expected = expectedPosition(props.state);
      suppressAudio.current = Date.now() + 800;
      if (Math.abs(audio.currentTime - expected) > 1.5) audio.currentTime = expected;
      if (props.state.playing && audio.paused) void audio.play().catch(() => undefined);
      if (!props.state.playing && !audio.paused) audio.pause();
    };
    sync();
    const interval = window.setInterval(sync, 3000);
    return () => window.clearInterval(interval);
  }, [item?.sourceId, item?.playbackKind, props.state.playing, props.state.updatedAt]);

  function seek(position: number) {
    youtube.seekLocal(position);
    if (audioRef.current) {
      suppressAudio.current = Date.now() + 800;
      audioRef.current.currentTime = position;
    }
    props.onSeek(position);
  }

  const repeatIcon = props.state.repeatMode === "one" ? <Repeat1 size={19} /> : <Repeat size={19} />;
  const duration = item?.durationSeconds ?? 0;

  return (
    <main className="center-panel" aria-label="Shared player and queue">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Shared session</p>
          <h2>Queue</h2>
        </div>
        <span className="count-pill">{props.state.queue.length} upcoming</span>
      </div>

      <section className="player-card">
        <div className={`youtube-stage ${item?.playbackKind === "youtube" ? "" : "stage-hidden"}`}>
          <div ref={youtube.containerRef} className="youtube-mount" />
        </div>
        {item?.playbackKind === "audio" ? (
          <div className="audio-stage">
            <div className="audio-disc" aria-hidden="true"><span /></div>
            <p>Shared uploaded audio</p>
            <audio
              ref={audioRef}
              src={item.url}
              controls
              preload="metadata"
              onPlay={() => {
                if (props.canManage && Date.now() > suppressAudio.current && !props.state.playing) props.onPlay();
              }}
              onPause={() => {
                if (props.canManage && Date.now() > suppressAudio.current && props.state.playing) props.onPause(audioRef.current?.currentTime ?? 0);
              }}
              onEnded={() => props.onEnded(item.queueItemId)}
            />
          </div>
        ) : null}
        {item?.playbackKind === "none" ? (
          <div className="metadata-stage">
            <SourceBadge source="spotify" metadataOnly />
            <h3>Spotify audio is not played in this Activity</h3>
            <p>Use the title to search YouTube for an official embeddable version.</p>
          </div>
        ) : null}
        {!item ? (
          <div className="empty-stage">
            <Video size={40} />
            <h3>Add a YouTube video or uploaded audio</h3>
            <p>The host can start playback when the queue is ready.</p>
          </div>
        ) : null}

        <div className="track-heading">
          <div>
            <h3>{item?.title ?? "Nothing playing"}</h3>
            <p>{item?.creator ?? "Search for something to watch together"}</p>
          </div>
          {item ? <SourceBadge source={item.source} metadataOnly={item.metadataOnly} /> : null}
        </div>

        <div className="transport" aria-label="Shared playback controls">
          <button className={`icon-button ${props.state.shuffle ? "control-active" : ""}`} type="button" title="Shuffle" aria-label="Toggle shuffle" disabled={!props.canManage} onClick={() => props.onShuffle(!props.state.shuffle)}>
            <Shuffle size={19} />
          </button>
          <button className="icon-button" type="button" title="Previous" aria-label="Previous item" disabled={!props.canManage || !item} onClick={props.onPrevious}>
            <SkipBack size={22} fill="currentColor" />
          </button>
          <button className="play-button" type="button" aria-label={props.state.playing ? "Pause" : "Play"} disabled={!props.canManage || !item || item.playbackKind === "none"} onClick={() => props.state.playing ? props.onPause(props.progress) : props.onPlay()}>
            {props.state.playing ? <Pause size={25} fill="currentColor" /> : <Play size={25} fill="currentColor" />}
          </button>
          <button className="icon-button" type="button" title="Next" aria-label="Next item" disabled={!props.canManage || !item} onClick={props.onNext}>
            <SkipForward size={22} fill="currentColor" />
          </button>
          <button className={`icon-button ${props.state.repeatMode !== "off" ? "control-active" : ""}`} type="button" title={`Repeat: ${props.state.repeatMode}`} aria-label={`Repeat mode ${props.state.repeatMode}`} disabled={!props.canManage} onClick={() => props.onRepeat(nextRepeat(props.state.repeatMode))}>
            {repeatIcon}
          </button>
        </div>

        <div className="shared-progress">
          <span>{formatTime(props.progress)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(1, duration)}
            step={0.25}
            value={Math.min(props.progress, Math.max(1, duration))}
            disabled={!props.canManage || !item || item.playbackKind === "none"}
            aria-label="Shared playback position"
            onChange={(event) => seek(Number(event.target.value))}
          />
          <span>{formatTime(duration)}</span>
        </div>
        <div className="sync-line">
          <span>{props.canManage ? "Shared controls" : "Host controls playback"}</span>
          {item?.playbackKind === "youtube" ? <span className={`sync-${youtube.syncStatus}`}>{youtube.syncStatus === "correcting" ? "Correcting drift" : youtube.ready ? "In sync" : "Loading player"}</span> : null}
        </div>
      </section>

      <section className="queue-card">
        <QueueList items={props.state.queue} canManage={props.canManage} canAdd={props.canAdd} onReorder={props.onReorder} onRemove={props.onRemove} onPlayNext={props.onPlayNext} />
        <div className="queue-footer">
          <span>{props.state.queue.length} items · {formatTime(props.state.queue.reduce((total, next) => total + next.durationSeconds, 0))}</span>
          <button className="secondary-button" type="button" disabled={!props.canManage || props.state.queue.length === 0} onClick={props.onClear}>
            <Trash2 size={16} /> Clear queue
          </button>
        </div>
      </section>
    </main>
  );
}
