import Link from "next/link";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import { useRef, useState } from "react";
import GuideImageUploader from "../../components/admin/GuideImageUploader";
import { getAllGuides, type GuideSummary } from "../../lib/guides";
import { authOptions } from "../api/auth/[...nextauth]";

interface GuideImagesPageProps {
  guides: GuideSummary[];
}

interface EditableGuide {
  slug: string;
  title: string;
  body: string;
  coverImage: string;
  coverImageAlt: string;
}

export const getServerSideProps: GetServerSideProps<GuideImagesPageProps> = async (
  context,
) => {
  const session = await getServerSession(
    context.req,
    context.res,
    authOptions as NextAuthOptions,
  );

  if ((session?.user as { role?: string } | undefined)?.role !== "admin") {
    return {
      redirect: { destination: "/login", permanent: false },
    };
  }

  return {
    props: {
      guides: getAllGuides(),
    },
  };
};

export default function GuideImagesPage({
  guides,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [selectedSlug, setSelectedSlug] = useState("");
  const [guide, setGuide] = useState<EditableGuide | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  async function loadGuide(slug: string) {
    setSelectedSlug(slug);
    setGuide(null);
    setMessage(null);
    setError(null);

    if (!slug) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `/api/admin/content/guide-editor?slug=${encodeURIComponent(slug)}`,
        { cache: "no-store" },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "The guide could not be loaded.");
      }

      setGuide(payload.guide as EditableGuide);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The guide could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  async function saveGuide() {
    if (!guide) {
      return;
    }

    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/content/guide-editor", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: guide.slug,
          body: guide.body,
          coverImage: guide.coverImage,
          coverImageAlt: guide.coverImageAlt,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "The guide could not be saved.");
      }

      setGuide(payload.guide as EditableGuide);
      setMessage(payload.message || "Guide saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The guide could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="container guide-images-admin">
      <header className="page-header">
        <div>
          <p className="eyebrow">Admin tools</p>
          <h1>Guide pictures</h1>
          <p>
            Add a cover image or insert pictures into existing guide Markdown without
            editing files on the server.
          </p>
        </div>
        <div className="header-links">
          <Link href="/admin/content">Content creator</Link>
          <Link href="/admin/guide-links">Guide links</Link>
          <Link href="/admin">Admin panel</Link>
        </div>
      </header>

      {message && <p className="notice success">{message}</p>}
      {error && <p className="notice error">{error}</p>}

      <section className="editor-card">
        <label>
          Choose a guide
          <select value={selectedSlug} onChange={(event) => loadGuide(event.target.value)}>
            <option value="">Select a guide…</option>
            {guides.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.title}
              </option>
            ))}
          </select>
        </label>

        {loading && <p className="muted">Loading guide…</p>}

        {guide && (
          <>
            <div className="selected-guide">
              <div>
                <span>{guide.slug}</span>
                <h2>{guide.title}</h2>
              </div>
              <Link href={`/guides/${guide.slug}`} target="_blank">
                View guide ↗
              </Link>
            </div>

            <GuideImageUploader
              body={guide.body}
              onBodyChange={(body) => setGuide((current) => current && { ...current, body })}
              coverImage={guide.coverImage}
              coverImageAlt={guide.coverImageAlt}
              onCoverChange={(coverImage, coverImageAlt) =>
                setGuide((current) =>
                  current && { ...current, coverImage, coverImageAlt },
                )
              }
              textareaRef={textareaRef}
            />

            <label>
              Guide body (Markdown)
              <textarea
                ref={textareaRef}
                rows={24}
                className="code-input"
                value={guide.body}
                onChange={(event) =>
                  setGuide((current) =>
                    current && { ...current, body: event.target.value },
                  )
                }
              />
            </label>

            <button className="primary save-button" disabled={saving} onClick={saveGuide}>
              {saving ? "Saving…" : "Save guide changes"}
            </button>
          </>
        )}
      </section>

      <style jsx>{`
        .guide-images-admin { padding-top: 28px; padding-bottom: 60px; }
        .page-header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 22px; }
        .page-header h1 { margin: 0; font-size: clamp(2rem, 6vw, 3.2rem); }
        .page-header p:last-child { max-width: 720px; color: #8b949e; line-height: 1.55; }
        .eyebrow { margin: 0 0 6px; color: #3fb950; font-size: .75rem; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
        .header-links { display: flex; flex-wrap: wrap; gap: 12px; }
        .header-links a { color: #58a6ff; white-space: nowrap; }
        .editor-card { display: grid; gap: 18px; padding: 22px; border: 1px solid #30363d; border-radius: 12px; background: #161b22; }
        label { display: grid; gap: 7px; color: #f0f6fc; font-weight: 700; }
        select, textarea { width: 100%; box-sizing: border-box; border: 1px solid #30363d; border-radius: 7px; padding: 10px; background: #0d1117; color: #f0f6fc; font: inherit; }
        textarea { resize: vertical; }
        .selected-guide { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 14px; border: 1px solid #30363d; border-radius: 9px; background: #0d1117; }
        .selected-guide span { color: #79c0ff; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .75rem; }
        .selected-guide h2 { margin: 4px 0 0; }
        .selected-guide a { color: #58a6ff; white-space: nowrap; }
        .code-input { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .86rem; line-height: 1.55; }
        .primary { border: 0; border-radius: 8px; padding: 11px 17px; background: #238636; color: #fff; font-weight: 800; cursor: pointer; }
        .save-button { justify-self: start; }
        .primary:disabled { opacity: .6; cursor: wait; }
        .notice { padding: 11px 14px; border-radius: 8px; }
        .notice.success { border: 1px solid #238636; background: rgba(35,134,54,.15); }
        .notice.error { border: 1px solid #f85149; background: rgba(248,81,73,.12); }
        .muted { color: #8b949e; }
        @media (max-width: 800px) {
          .page-header, .selected-guide { flex-direction: column; align-items: flex-start; }
        }
      `}</style>
    </main>
  );
}
