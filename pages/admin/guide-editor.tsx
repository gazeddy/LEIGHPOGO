import Link from "next/link";
import { useRouter } from "next/router";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import { useEffect, useMemo, useRef, useState } from "react";
import GuideImageUploader from "../../components/admin/GuideImageUploader";
import { getAllGuides, type GuideSummary } from "../../lib/guides";
import { authOptions } from "../api/auth/[...nextauth]";

interface GuideEditorPageProps {
  guides: GuideSummary[];
}

interface EditableGuide {
  slug: string;
  title: string;
  description: string;
  date: string;
  order: number | null;
  eventTypes: string[];
  tags: string[];
  series: string;
  seriesOrder: number | null;
  relatedGuides: string[];
  body: string;
  coverImage: string;
  coverImageAlt: string;
}

function commaSeparatedValues(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

export const getServerSideProps: GetServerSideProps<GuideEditorPageProps> = async (
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

export default function GuideEditorPage({
  guides,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [selectedSlug, setSelectedSlug] = useState("");
  const [guide, setGuide] = useState<EditableGuide | null>(null);
  const [eventTypesText, setEventTypesText] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const seriesOptions = useMemo(
    () =>
      Array.from(
        new Set(guides.map((item) => item.series).filter(Boolean) as string[]),
      ).sort(),
    [guides],
  );

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const requestedSlug =
      typeof router.query.slug === "string" ? router.query.slug : "";

    if (!requestedSlug || requestedSlug === selectedSlug) {
      return;
    }

    void loadGuide(requestedSlug);
  }, [router.isReady, router.query.slug, selectedSlug]);

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

      const loadedGuide = payload.guide as EditableGuide;
      setGuide(loadedGuide);
      setEventTypesText(loadedGuide.eventTypes.join(", "));
      setTagsText(loadedGuide.tags.join(", "));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The guide could not be loaded.",
      );
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
          ...guide,
          eventTypes: commaSeparatedValues(eventTypesText),
          tags: commaSeparatedValues(tagsText),
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "The guide could not be saved.");
      }

      const savedGuide = payload.guide as EditableGuide;
      setGuide(savedGuide);
      setEventTypesText(savedGuide.eventTypes.join(", "));
      setTagsText(savedGuide.tags.join(", "));
      setMessage(payload.message || "Published guide saved.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The guide could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  function toggleRelatedGuide(slug: string, checked: boolean) {
    setGuide((current) => {
      if (!current) {
        return current;
      }

      const relatedGuides = checked
        ? Array.from(new Set([...current.relatedGuides, slug]))
        : current.relatedGuides.filter((item) => item !== slug);

      return { ...current, relatedGuides };
    });
  }

  return (
    <main className="container guide-editor-admin">
      <header className="page-header">
        <div>
          <p className="eyebrow">Admin tools</p>
          <h1>Published guide editor</h1>
          <p>
            Edit the text, title, metadata, series links and pictures of guides that
            are already published. The guide URL stays unchanged.
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
          Choose a published guide
          <select
            value={selectedSlug}
            onChange={(event) => void loadGuide(event.target.value)}
          >
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
                <span>/guides/{guide.slug}</span>
                <h2>{guide.title}</h2>
              </div>
              <Link href={`/guides/${guide.slug}`} target="_blank">
                View published guide ↗
              </Link>
            </div>

            <section className="metadata-grid" aria-label="Guide metadata">
              <label className="wide">
                Title
                <input
                  value={guide.title}
                  onChange={(event) =>
                    setGuide((current) =>
                      current && { ...current, title: event.target.value },
                    )
                  }
                />
              </label>

              <label className="wide">
                Description
                <textarea
                  rows={3}
                  value={guide.description}
                  onChange={(event) =>
                    setGuide((current) =>
                      current && { ...current, description: event.target.value },
                    )
                  }
                />
              </label>

              <label>
                Published date
                <input
                  type="date"
                  value={guide.date}
                  onChange={(event) =>
                    setGuide((current) =>
                      current && { ...current, date: event.target.value },
                    )
                  }
                />
              </label>

              <label>
                Display order
                <input
                  type="number"
                  min="0"
                  value={guide.order ?? ""}
                  onChange={(event) =>
                    setGuide((current) =>
                      current && {
                        ...current,
                        order: event.target.value === "" ? null : Number(event.target.value),
                      },
                    )
                  }
                />
              </label>

              <label>
                Event types
                <input
        value={eventTypesText}
        placeholder="max-battles, max-mondays"
        onChange={(event) => setEventTypesText(event.target.value)}
      />
              </label>

              <label>
                Tags
                <input
        value={tagsText}
        placeholder="max, dynamax, gigantamax"
        onChange={(event) => setTagsText(event.target.value)}
      />
              </label>

              <label>
                Series slug
                <input
                  list="guide-series-options"
                  value={guide.series}
                  placeholder="max-battles"
                  onChange={(event) =>
                    setGuide((current) =>
                      current && { ...current, series: event.target.value },
                    )
                  }
                />
                <datalist id="guide-series-options">
                  {seriesOptions.map((series) => (
                    <option key={series} value={series} />
                  ))}
                </datalist>
              </label>

              <label>
                Series position
                <input
                  type="number"
                  min="1"
                  value={guide.seriesOrder ?? ""}
                  onChange={(event) =>
                    setGuide((current) =>
                      current && {
                        ...current,
                        seriesOrder:
                          event.target.value === "" ? null : Number(event.target.value),
                      },
                    )
                  }
                />
              </label>
            </section>

            <fieldset className="related-guides">
              <legend>Related guides</legend>
              <div className="related-grid">
                {guides
                  .filter((item) => item.slug !== guide.slug)
                  .map((item) => (
                    <label key={item.slug} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={guide.relatedGuides.includes(item.slug)}
                        onChange={(event) =>
                          toggleRelatedGuide(item.slug, event.target.checked)
                        }
                      />
                      <span>{item.title}</span>
                    </label>
                  ))}
              </div>
            </fieldset>

            <GuideImageUploader
              body={guide.body}
              onBodyChange={(body) =>
                setGuide((current) => current && { ...current, body })
              }
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
                rows={28}
                className="code-input"
                value={guide.body}
                onChange={(event) =>
                  setGuide((current) =>
                    current && { ...current, body: event.target.value },
                  )
                }
              />
            </label>

            <button
              type="button"
              className="primary save-button"
              disabled={saving}
              onClick={() => void saveGuide()}
            >
              {saving ? "Saving…" : "Save published guide"}
            </button>
          </>
        )}
      </section>

      <style jsx>{`
        .guide-editor-admin { padding-top: 28px; padding-bottom: 60px; }
        .page-header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 22px; }
        .page-header h1 { margin: 0; font-size: clamp(2rem, 6vw, 3.2rem); }
        .page-header p:last-child { max-width: 720px; color: #8b949e; line-height: 1.55; }
        .eyebrow { margin: 0 0 6px; color: #3fb950; font-size: .75rem; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
        .header-links { display: flex; flex-wrap: wrap; gap: 12px; }
        .header-links a { color: #58a6ff; white-space: nowrap; }
        .editor-card { display: grid; gap: 20px; padding: 22px; border: 1px solid #30363d; border-radius: 12px; background: #161b22; }
        label { display: grid; gap: 7px; color: #f0f6fc; font-weight: 700; }
        input, select, textarea { width: 100%; box-sizing: border-box; border: 1px solid #30363d; border-radius: 7px; padding: 10px; background: #0d1117; color: #f0f6fc; font: inherit; }
        textarea { resize: vertical; }
        .selected-guide { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 14px; border: 1px solid #30363d; border-radius: 9px; background: #0d1117; }
        .selected-guide span { color: #79c0ff; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .75rem; }
        .selected-guide h2 { margin: 4px 0 0; }
        .selected-guide a { color: #58a6ff; white-space: nowrap; }
        .metadata-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
        .metadata-grid .wide { grid-column: 1 / -1; }
        .related-guides { margin: 0; border: 1px solid #30363d; border-radius: 9px; padding: 14px; }
        .related-guides legend { padding: 0 7px; color: #f0f6fc; font-weight: 800; }
        .related-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 9px; }
        .checkbox-label { display: flex; grid-template-columns: none; align-items: flex-start; gap: 8px; padding: 8px; border-radius: 6px; background: #0d1117; font-weight: 500; }
        .checkbox-label input { width: auto; margin-top: 3px; }
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
          .metadata-grid { grid-template-columns: 1fr; }
          .metadata-grid .wide { grid-column: auto; }
        }
      `}</style>
    </main>
  );
}
