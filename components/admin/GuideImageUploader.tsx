import Image, { type ImageLoaderProps } from "next/image";
import { useState, type RefObject } from "react";
import { normalizeYouTubeUrl } from "../../lib/youtube";

interface GuideImageUploaderProps {
  body: string;
  onBodyChange: (body: string) => void;
  coverImage: string;
  coverImageAlt: string;
  onCoverChange: (url: string, alt: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

interface UploadResponse {
  error?: string;
  message?: string;
  url?: string;
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

function passthroughImageLoader({ src }: ImageLoaderProps): string {
  return src;
}

function canOptimizeGuideImage(src: string): boolean {
  return src.startsWith("/") && !src.startsWith("//");
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("The image could not be read."));
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.readAsDataURL(file);
  });
}

export default function GuideImageUploader({
  body,
  onBodyChange,
  coverImage,
  coverImageAlt,
  onCoverChange,
  textareaRef,
}: GuideImageUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [uploading, setUploading] = useState<"inline" | "cover" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function insertMarkdownAtCursor(markdown: string) {
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
    const inserted = `${prefix}${markdown}${suffix}`;
    const nextBody = `${before}${inserted}${after}`;

    onBodyChange(nextBody);

    requestAnimationFrame(() => {
      const nextPosition = start + inserted.length;
      textarea?.focus();
      textarea?.setSelectionRange(nextPosition, nextPosition);
    });
  }

  async function uploadImage(mode: "inline" | "cover") {
    setMessage(null);
    setError(null);

    if (!file) {
      setError("Choose an image first.");
      return;
    }

    if (!alt.trim()) {
      setError("Alternative text is required for accessibility.");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setError("Images must be 5 MB or smaller.");
      return;
    }

    setUploading(mode);

    try {
      const dataUrl = await readAsDataUrl(file);
      const response = await fetch("/api/admin/content/guide-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type,
          dataUrl,
        }),
      });
      const payload = (await response.json()) as UploadResponse;

      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "The image could not be uploaded.");
      }

      if (mode === "cover") {
        onCoverChange(payload.url, alt.trim());
        setMessage("Cover image uploaded and selected.");
      } else {
        const imageMarkdown = `![${alt.trim()}](${payload.url})`;
        const markdown = caption.trim()
          ? `${imageMarkdown}\n\n*${caption.trim()}*`
          : imageMarkdown;

        insertMarkdownAtCursor(markdown);
        setMessage("Image uploaded and inserted into the guide.");
      }

      setFile(null);
      setAlt("");
      setCaption("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The image could not be uploaded.",
      );
    } finally {
      setUploading(null);
    }
  }

  function insertYouTubeVideo() {
    setMessage(null);
    setError(null);

    const normalizedUrl = normalizeYouTubeUrl(youtubeUrl);

    if (!normalizedUrl) {
      setError("Paste a valid YouTube video link first.");
      return;
    }

    insertMarkdownAtCursor(normalizedUrl);
    setYoutubeUrl("");
    setMessage("YouTube video inserted into the guide.");
  }

  const optimizeCoverImage = coverImage
    ? canOptimizeGuideImage(coverImage)
    : false;

  return (
    <fieldset className="guide-media-uploader">
      <legend>Guide media</legend>

      <section className="media-section">
        <h3>Pictures</h3>
        <p className="field-help">
          Upload JPEG, PNG or WebP images up to 5 MB. Inline images are inserted at
          the current cursor position in the Markdown editor.
        </p>

        <label>
          Image file
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setMessage(null);
              setError(null);
            }}
          />
        </label>

        <label>
          Alternative text
          <input
            value={alt}
            placeholder="Describe what the picture shows"
            onChange={(event) => setAlt(event.target.value)}
          />
        </label>

        <label>
          Caption (optional, inline images only)
          <input
            value={caption}
            placeholder="A short explanation shown below the picture"
            onChange={(event) => setCaption(event.target.value)}
          />
        </label>

        <div className="media-actions">
          <button
            type="button"
            className="primary"
            disabled={uploading !== null}
            onClick={() => uploadImage("inline")}
          >
            {uploading === "inline" ? "Uploading…" : "Upload & insert at cursor"}
          </button>
          <button
            type="button"
            disabled={uploading !== null}
            onClick={() => uploadImage("cover")}
          >
            {uploading === "cover" ? "Uploading…" : "Upload as cover"}
          </button>
        </div>
      </section>

      <section className="media-section youtube-section">
        <h3>YouTube video</h3>
        <p className="field-help">
          Paste a YouTube, youtu.be, Shorts or Live video link. The published guide
          turns it into a responsive 16:9 player. Autoplay starts muted so modern
          browsers allow it where autoplay is permitted.
        </p>

        <label>
          YouTube link
          <input
            type="url"
            value={youtubeUrl}
            placeholder="https://www.youtube.com/watch?v=..."
            onChange={(event) => {
              setYoutubeUrl(event.target.value);
              setMessage(null);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                insertYouTubeVideo();
              }
            }}
          />
        </label>

        <div className="media-actions">
          <button type="button" className="primary" onClick={insertYouTubeVideo}>
            Insert YouTube video at cursor
          </button>
        </div>
      </section>

      {coverImage && (
        <div className="cover-preview">
          <Image
            src={coverImage}
            alt={coverImageAlt || "Current guide cover"}
            width={1200}
            height={675}
            sizes="(max-width: 600px) 100vw, 220px"
            className="cover-preview-image"
            loader={optimizeCoverImage ? undefined : passthroughImageLoader}
            unoptimized={!optimizeCoverImage}
          />
          <div>
            <strong>Current cover image</strong>
            <small>{coverImageAlt || "No alternative text set"}</small>
            <button type="button" onClick={() => onCoverChange("", "")}>Remove cover</button>
          </div>
        </div>
      )}

      {message && <p className="upload-message success">{message}</p>}
      {error && <p className="upload-message error">{error}</p>}

      <style jsx>{`
        .guide-media-uploader { display: grid; gap: 16px; border: 1px solid #30363d; border-radius: 8px; padding: 12px; }
        .media-section { display: grid; gap: 12px; }
        .media-section + .media-section { padding-top: 16px; border-top: 1px solid #30363d; }
        .media-section h3 { margin: 0; color: #f0f6fc; font-size: 1rem; }
        .guide-media-uploader label { display: grid; gap: 7px; color: #f0f6fc; font-weight: 700; }
        .guide-media-uploader input { width: 100%; box-sizing: border-box; border: 1px solid #30363d; border-radius: 7px; padding: 10px; background: #0d1117; color: #f0f6fc; font: inherit; }
        .field-help { margin: 0 0 4px; color: #8b949e; font-size: .86rem; font-weight: 400; line-height: 1.5; }
        .media-actions { display: flex; flex-wrap: wrap; gap: 8px; }
        .media-actions button,
        .cover-preview button { border: 1px solid #30363d; border-radius: 7px; padding: 9px 12px; background: #21262d; color: #f0f6fc; font-weight: 800; cursor: pointer; }
        .media-actions .primary { border-color: #238636; background: #238636; }
        .media-actions button:disabled { opacity: .6; cursor: wait; }
        .cover-preview { display: grid; grid-template-columns: minmax(120px, 220px) 1fr; gap: 12px; align-items: center; padding: 12px; border: 1px solid #30363d; border-radius: 8px; background: #0d1117; }
        .cover-preview-image { width: 100%; height: auto; max-height: 150px; object-fit: cover; border-radius: 7px; }
        .cover-preview div { display: grid; gap: 7px; justify-items: start; min-width: 0; }
        .cover-preview small { color: #8b949e; overflow-wrap: anywhere; }
        .upload-message { margin: 0; padding: 9px 11px; border-radius: 7px; }
        .upload-message.success { border: 1px solid #238636; background: rgba(35,134,54,.15); }
        .upload-message.error { border: 1px solid #f85149; background: rgba(248,81,73,.12); }
        @media (max-width: 600px) { .cover-preview { grid-template-columns: 1fr; } }
      `}</style>
    </fieldset>
  );
}
