import { useState, type RefObject } from "react";

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
  const [uploading, setUploading] = useState<"inline" | "cover" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        const textarea = textareaRef.current;
        const start = textarea?.selectionStart ?? body.length;
        const end = textarea?.selectionEnd ?? start;
        const prefix = start > 0 && !body.slice(0, start).endsWith("\n") ? "\n\n" : "";
        const suffix = end < body.length && !body.slice(end).startsWith("\n") ? "\n\n" : "";
        const inserted = `${prefix}${markdown}${suffix}`;
        const nextBody = `${body.slice(0, start)}${inserted}${body.slice(end)}`;

        onBodyChange(nextBody);
        setMessage("Image uploaded and inserted into the guide.");

        requestAnimationFrame(() => {
          const nextPosition = start + inserted.length;
          textarea?.focus();
          textarea?.setSelectionRange(nextPosition, nextPosition);
        });
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

  return (
    <fieldset className="guide-image-uploader">
      <legend>Guide pictures</legend>
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

      <div className="image-actions">
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

      {coverImage && (
        <div className="cover-preview">
          <img src={coverImage} alt={coverImageAlt || "Current guide cover"} />
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
        .guide-image-uploader { display: grid; gap: 12px; border: 1px solid #30363d; border-radius: 8px; padding: 12px; }
        .guide-image-uploader label { display: grid; gap: 7px; color: #f0f6fc; font-weight: 700; }
        .guide-image-uploader input { width: 100%; box-sizing: border-box; border: 1px solid #30363d; border-radius: 7px; padding: 10px; background: #0d1117; color: #f0f6fc; font: inherit; }
        .field-help { margin: 0 0 4px; color: #8b949e; font-size: .86rem; font-weight: 400; line-height: 1.5; }
        .image-actions { display: flex; flex-wrap: wrap; gap: 8px; }
        .image-actions button,
        .cover-preview button { border: 1px solid #30363d; border-radius: 7px; padding: 9px 12px; background: #21262d; color: #f0f6fc; font-weight: 800; cursor: pointer; }
        .image-actions .primary { border-color: #238636; background: #238636; }
        .image-actions button:disabled { opacity: .6; cursor: wait; }
        .cover-preview { display: grid; grid-template-columns: minmax(120px, 220px) 1fr; gap: 12px; align-items: center; padding: 12px; border: 1px solid #30363d; border-radius: 8px; background: #0d1117; }
        .cover-preview img { width: 100%; max-height: 150px; object-fit: cover; border-radius: 7px; }
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
