import { FileAudio, Music2 } from "lucide-react";
import type { ActivityMediaItem } from "../types/activity";

export function MediaThumb({ item, className = "" }: { item: ActivityMediaItem; className?: string }) {
  if (item.thumbnailUrl) {
    return <img className={`media-thumb ${className}`} src={item.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />;
  }
  return (
    <div className={`media-thumb media-thumb-fallback ${className}`} aria-hidden="true">
      {item.source === "upload" ? <FileAudio size={22} /> : <Music2 size={22} />}
    </div>
  );
}

export function SourceBadge({ source, metadataOnly }: { source: ActivityMediaItem["source"]; metadataOnly?: boolean }) {
  const label = source === "youtube" ? "YouTube" : source === "spotify" ? "Spotify metadata" : "Uploaded audio";
  return <span className={`source-badge source-${source}`}>{metadataOnly ? "Metadata only" : label}</span>;
}
