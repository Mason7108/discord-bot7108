import { AlertCircle, ChevronDown, Plus, Search } from "lucide-react";
import type { ActivityMediaItem } from "../types/activity";
import { formatTime } from "../utils/time";
import { MediaThumb, SourceBadge } from "./MediaThumb";

type Props = {
  items: ActivityMediaItem[];
  loading: boolean;
  error?: string;
  searched: boolean;
  canAdd: boolean;
  hasMore: boolean;
  onAdd: (item: ActivityMediaItem) => void;
  onMore: () => void;
};

export function SearchPanel(props: Props) {
  return (
    <section className="results-panel panel-band" aria-label="Search results">
      <div className="panel-title-row">
        <div><p className="eyebrow">YouTube</p><h2>Results</h2></div>
      </div>
      <div className="results-list" aria-live="polite">
        {props.loading && props.items.length === 0 ? Array.from({ length: 6 }, (_, index) => <div className="result-skeleton" key={index}><span /><div><i /><i /></div></div>) : null}
        {props.error ? <div className="panel-message error-message"><AlertCircle size={22} /><strong>Search unavailable</strong><span>{props.error}</span></div> : null}
        {!props.loading && !props.error && props.searched && props.items.length === 0 ? <div className="panel-message"><Search size={24} /><strong>No embeddable videos found</strong><span>Try a different title or channel name.</span></div> : null}
        {!props.searched && !props.loading ? <div className="panel-message"><Search size={24} /><strong>Search YouTube</strong><span>Results are filtered to videos that allow embedding.</span></div> : null}
        {props.items.map((item) => (
          <article className="result-row" key={item.id}>
            <div className="result-art"><MediaThumb item={item} /><span>{formatTime(item.durationSeconds)}</span></div>
            <div className="media-copy">
              <strong title={item.title}>{item.title}</strong>
              <span title={item.creator}>{item.creator}</span>
              <SourceBadge source={item.source} metadataOnly={item.metadataOnly} />
            </div>
            <button className="add-button" type="button" disabled={!props.canAdd} onClick={() => props.onAdd(item)} aria-label={`Add ${item.title} to queue`}>
              <Plus size={17} /> Add
            </button>
          </article>
        ))}
      </div>
      {props.hasMore ? (
        <button className="show-more" type="button" disabled={props.loading} onClick={props.onMore}>
          {props.loading ? "Loading" : "Show more results"}<ChevronDown size={17} />
        </button>
      ) : null}
    </section>
  );
}
