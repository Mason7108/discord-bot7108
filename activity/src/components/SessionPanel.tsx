import { CheckCircle2, Crown, Link2, Radio, Users, Volume2, Wifi, WifiOff } from "lucide-react";
import type { ActivityIdentity, ActivitySessionState, ConnectionStatus } from "../types/activity";
import { formatTime } from "../utils/time";
import { MediaThumb } from "./MediaThumb";

type Props = {
  state: ActivitySessionState;
  identity: ActivityIdentity;
  status: ConnectionStatus;
  progress: number;
  volume: number;
  onVolume: (volume: number) => void;
  onCollaboration: (enabled: boolean) => void;
  onTransferHost: (userId: string) => void;
};

export function SessionPanel(props: Props) {
  const host = props.state.listeners.find((listener) => listener.id === props.state.hostUserId);
  const isHost = props.identity.id === props.state.hostUserId;
  const item = props.state.nowPlaying;
  const progressPercent = item?.durationSeconds ? Math.min(100, (props.progress / item.durationSeconds) * 100) : 0;

  return (
    <aside className="session-panel" aria-label="Activity session">
      <section className="now-playing-card">
        <div className="now-label"><span>Now Playing</span><Radio size={18} /></div>
        <div className="host-row">
          <div className="avatar">{host?.avatarUrl ? <img src={host.avatarUrl} alt="" /> : <span>{(host?.username ?? "?").slice(0, 1).toUpperCase()}</span>}</div>
          <div><strong>{host?.username ?? "Waiting for host"}</strong><span><Crown size={12} /> Session host</span></div>
        </div>
        {item ? <MediaThumb item={item} className="now-art" /> : null}
        <h3>{item?.title ?? "Nothing playing"}</h3>
        <p>{item?.creator ?? "Add something to begin"}</p>
        <div className="mini-progress"><i style={{ width: `${progressPercent}%` }} /></div>
        <div className="time-row"><span>{formatTime(props.progress)}</span><span>{formatTime(item?.durationSeconds ?? 0)}</span></div>
      </section>

      <section className="session-section local-control">
        <div className="section-label-row"><div><Volume2 size={17} /><h3>Local volume</h3></div><span>{props.volume}%</span></div>
        <input type="range" min={0} max={100} value={props.volume} aria-label="Local playback volume" onChange={(event) => props.onVolume(Number(event.target.value))} />
        <p>Only changes sound on this device.</p>
      </section>

      <section className="session-section">
        <div className="section-label-row"><div><Users size={17} /><h3>People listening</h3></div><span>{props.state.listeners.length}</span></div>
        <div className="listeners-list">
          {props.state.listeners.map((listener) => (
            <div key={listener.id}>
              <div className="avatar small-avatar">{listener.avatarUrl ? <img src={listener.avatarUrl} alt="" /> : <span>{listener.username.slice(0, 1).toUpperCase()}</span>}</div>
              <span>{listener.username}</span>
              {listener.host ? <Crown size={14} aria-label="Host" /> : <i />}
              {isHost && !listener.host ? <button type="button" onClick={() => props.onTransferHost(listener.id)}>Make host</button> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="session-section">
        <div className="section-label-row"><div><CheckCircle2 size={17} /><h3>Session controls</h3></div></div>
        <label className="toggle-row">
          <span><strong>Collaborative queue</strong><small>Listeners can add and suggest tracks</small></span>
          <input type="checkbox" checked={props.state.collaborationEnabled} disabled={!isHost} onChange={(event) => props.onCollaboration(event.target.checked)} />
          <i aria-hidden="true" />
        </label>
      </section>

      <section className="session-section up-next-compact">
        <div className="section-label-row"><div><Radio size={17} /><h3>Up next</h3></div></div>
        {props.state.queue.slice(0, 3).map((next) => <div key={next.queueItemId}><MediaThumb item={next} /><span><strong>{next.title}</strong><small>{next.creator}</small></span><time>{formatTime(next.durationSeconds)}</time></div>)}
        {props.state.queue.length === 0 ? <p>Queue is empty.</p> : null}
      </section>

      <div className={`connection-status status-${props.status}`}>
        {props.status === "connected" ? <Wifi size={16} /> : <WifiOff size={16} />}
        <span>{props.status === "connected" ? "Connected and synchronized" : props.status}</span>
      </div>

      <button className="secondary-button share-button" type="button" onClick={() => void navigator.clipboard?.writeText(window.location.href)}>
        <Link2 size={16} /> Copy Activity link
      </button>
    </aside>
  );
}
