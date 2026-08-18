import { useState, type RefObject } from "react";
import { normalizeYouTubeUrl } from "../../lib/youtube";

interface GuideYouTubeEmbedderProps {
  body: string;
  onBodyChange: (body: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

export default function GuideYouTubeEmbedder({
  body,
  onBodyChange,
  textareaRef,
}: GuideYouTubeEmbedderProps) {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function insertVideo() {
    setMessage(null);
    setError(null);

    const normalizedUrl = normalizeYouTubeUrl(url);

    if (!normalizedUrl) {
      setError("Paste a valid YouTube video link first.");
      return;
    }

    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? body.length;
    const end = textarea?.selectionEnd ?? start;
    const before = body.slice(0, start);
    const after = body.slice(end);
    const prefix = before.length > 0 && !before.endsWith("\n\n")
      ? before.endsWith("\n")
        ? "\n"
        : "\n\n"
      : "";
    const suffix = after.length > 0 && !after.startsWith("\n\n")
      ? after.startsWith("\n")
        ? "\n"
        : "\n\n"
      : "";
    const inserted = `${prefix}${normalizedUrl}${suffix}`;
    const nextBody = `${before}${inserted}${after}`;

    onBodyChange(nextBody);
    setUrl("");
    setMessage("YouTube video inserted into the guide.");

    requestAnimationFrame(() => {
      const nextPosition = start + inserted.length;
      textarea?.focus();
      textarea?.setSelectionRange(nextPosition, nextPosition);
    });
  }

  return (
    <fieldset className="guide-youtube-embedder">
      <legend>YouTube video</legend>
      <p className="field-help">
        Paste a YouTube, youtu.be, Shorts or Live video link. It will be inserted at
        the current cursor position and shown as an embedded player in the published
        guide. Autoplay starts muted so modern browsers allow it reliably.
      </p>

      <label>
        YouTube link
        <input
          type="url"
          value={url}
          placeholder="https://www.youtube.com/watch?v=..."
          onChange={(event) => {
            setUrl(event.target.value);
            setMessage(null);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              insertVideo();
            }
          }}
        />
      </label>

      <button type="button" className="primary" onClick={insertVideo}>
        Insert YouTube video at cursor
      </button>

      {message && <p className="embed-message success">{message}</p>}
      {error && <p className="embed-message error">{error}</p>}

      <style jsx>{`
        .guide-youtube-embedder { display: grid; gap: 12px; border: 1px solid #30363d; border-radius: 8px; padding: 12px; }
        .guide-youtube-embedder label { display: grid; gap: 7px; color: #f0f6fc; font-weight: 700; }
        .guide-youtube-embedder input { width: 100%; box-sizing: border-box; border: 1px solid #30363d; border-radius: 7px; padding: 10px; background: #0d1117; color: #f0f6fc; font: inherit; }
        .field-help { margin: 0 0 4px; color: #8b949e; font-size: .86rem; font-weight: 400; line-height: 1.5; }
        .primary { justify-self: start; border: 0; border-radius: 8px; padding: 11px 17px; background: #238636; color: #fff; font-weight: 800; cursor: pointer; }
        .embed-message { margin: 0; padding: 9px 11px; border-radius: 7px; }
        .embed-message.success { border: 1px solid #238636; background: rgba(35,134,54,.15); }
        .embed-message.error { border: 1px solid #f85149; background: rgba(248,81,73,.12); }
      `}</style>
    </fieldset>
  );
}
