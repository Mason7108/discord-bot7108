import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { FileUp, History, Info, Link2, ListMusic, Search, UploadCloud } from "lucide-react";

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onResolve: (url: string) => Promise<void>;
  onUpload: (file: File) => Promise<void>;
  uploadProgress: number | null;
  recent: string[];
  disabled: boolean;
};

const accepted = ".mp3,.wav,.m4a,.aac,.flac,audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/flac";

export function Sidebar(props: Props) {
  const [link, setLink] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    props.onSearch();
  }
  async function submitLink(event: FormEvent) {
    event.preventDefault();
    if (!link.trim()) return;
    await props.onResolve(link.trim());
    setLink("");
  }
  async function chooseFile(file?: File) {
    if (file) await props.onUpload(file);
  }
  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void chooseFile(event.dataTransfer.files[0]);
  }

  return (
    <aside className="sidebar panel-band" aria-label="Media sources">
      <form className="search-form" onSubmit={submitSearch}>
        <Search size={19} aria-hidden="true" />
        <input value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} placeholder="Search YouTube" aria-label="Search YouTube videos" disabled={props.disabled} />
      </form>

      <form className="link-form" onSubmit={submitLink}>
        <Link2 size={19} aria-hidden="true" />
        <input value={link} onChange={(event) => setLink(event.target.value)} placeholder="Paste YouTube or Spotify link" aria-label="Media link" disabled={props.disabled} />
        <button type="submit" className="small-command" disabled={props.disabled || !link.trim()}>Add</button>
      </form>

      <section className="upload-section">
        <div className="section-label-row">
          <div><FileUp size={17} /><h3>Upload audio</h3></div>
          <span title="Up to the server-configured file limit"><Info size={16} /></span>
        </div>
        <button
          type="button"
          className={`upload-drop ${dragging ? "upload-drop-active" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
          disabled={props.disabled || props.uploadProgress !== null}
        >
          <UploadCloud size={37} />
          <strong>{props.uploadProgress === null ? "Drop audio here" : `Uploading ${props.uploadProgress}%`}</strong>
          <span>MP3, WAV, M4A, AAC, or FLAC</span>
          {props.uploadProgress !== null ? <i style={{ width: `${props.uploadProgress}%` }} /> : null}
        </button>
        <input ref={inputRef} className="visually-hidden" type="file" accept={accepted} onChange={(event) => void chooseFile(event.target.files?.[0])} />
        <p className="upload-consent">Only upload audio you own or have permission to share with this session.</p>
      </section>

      <section className="sidebar-section">
        <div className="section-label-row"><div><ListMusic size={17} /><h3>Sources</h3></div></div>
        <div className="source-filters" aria-label="Available sources">
          <span className="filter-youtube">YouTube</span>
          <span className="filter-spotify">Spotify metadata</span>
          <span className="filter-upload">Uploads</span>
        </div>
      </section>

      <section className="sidebar-section">
        <div className="section-label-row"><div><History size={17} /><h3>Recent searches</h3></div></div>
        <div className="compact-list">
          {props.recent.length ? props.recent.map((item) => (
            <button key={item} type="button" onClick={() => { props.onQueryChange(item); }}><Search size={14} />{item}</button>
          )) : <p>No recent searches yet.</p>}
        </div>
      </section>

      <section className="sidebar-section saved-section">
        <div className="section-label-row"><div><ListMusic size={17} /><h3>Saved Activity playlists</h3></div></div>
        <p>Saved playlists will appear here.</p>
      </section>
    </aside>
  );
}
