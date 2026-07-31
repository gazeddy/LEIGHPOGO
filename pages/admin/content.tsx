import Link from "next/link";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import { useMemo, useRef, useState } from "react";
import GuideImageUploader from "../../components/admin/GuideImageUploader";
import { getAllGuides, getGuideBySlug, type GuideSummary } from "../../lib/guides";
import { authOptions } from "../api/auth/[...nextauth]";

interface GuideEditorPageProps {
  initialGuides: GuideSummary[];
  initialGuide: EditableGuide | null;
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

const NEW_GUIDE_VALUE = "__new__";

function createBlankGuide(): EditableGuide {
  return {
    slug: "",
    title: "",
    description: "",
    date: new Date().toISOString().slice(0, 10),
    order: null,
    eventTypes: [],
    tags: [],
    series: "",
    seriesOrder: null,
    relatedGuides: [],
    body: "## Introduction\n\nWrite the guide here.\n",
    coverImage: "",
    coverImageAlt: "",
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function summaryForGuide(guide: EditableGuide): GuideSummary {
  return {
    slug: guide.slug,
    title: guide.title,
    description: guide.description,
    date: guide.date || undefined,
    order: guide.order ?? undefined,
    eventTypes: guide.eventTypes.length ? guide.eventTypes : undefined,
    tags: guide.tags.length ? guide.tags : undefined,
    series: guide.series || undefined,
    seriesOrder: guide.seriesOrder ?? undefined,
    relatedGuides: guide.relatedGuides.length ? guide.relatedGuides : undefined,
    coverImage: guide.coverImage || undefined,
    coverImageAlt: guide.coverImageAlt || undefined,
  };
}

function editableGuideForSlug(slug: string): EditableGuide | null {
  const guide = getGuideBySlug(slug);

  if (!guide) {
    return null;
  }

  return {
    slug: guide.slug,
    title: guide.title,
    description: guide.description,
    date: guide.date?.slice(0, 10) ?? "",
    order: guide.order ?? null,
    eventTypes: guide.eventTypes ?? [],
    tags: guide.tags ?? [],
    series: guide.series ?? "",
    seriesOrder: guide.seriesOrder ?? null,
    relatedGuides: guide.relatedGuides ?? [],
    body: guide.content,
    coverImage: guide.coverImage ?? "",
    coverImageAlt: guide.coverImageAlt ?? "",
  };
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

  const requestedSlug =
    typeof context.query.guide === "string" ? context.query.guide : "";

  return {
    props: {
      initialGuides: getAllGuides(),
      initialGuide: requestedSlug ? editableGuideForSlug(requestedSlug) : null,
    },
  };
};

export default function GuideCreatorEditorPage({
  initialGuides,
  initialGuide,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [guides, setGuides] = useState(initialGuides);
  const [selectedSlug, setSelectedSlug] = useState(
    initialGuide?.slug ?? NEW_GUIDE_VALUE,
  );
  const [guide, setGuide] = useState<EditableGuide | null>(() =>
    initialGuide ?? createBlankGuide(),
  );
  const [eventTypesText, setEventTypesText] = useState(
    initialGuide?.eventTypes.join(", ") ?? "",
  );
  const [tagsText, setTagsText] = useState(
    initialGuide?.tags.join(", ") ?? "",
  );
  const [slugTouched, setSlugTouched] = useState(Boolean(initialGuide));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isNewGuide = selectedSlug === NEW_GUIDE_VALUE;

  const seriesOptions = useMemo(
    () =>
      Array.from(
        new Set(guides.map((item) => item.series).filter(Boolean) as string[]),
      ).sort(),
    [guides],
  );

  function startNewGuide() {
    setSelectedSlug(NEW_GUIDE_VALUE);
    setGuide(createBlankGuide());
    setEventTypesText("");
    setTagsText("");
    setSlugTouched(false);
    setMessage(null);
    setError(null);
  }

  async function chooseGuide(slug: string) {
    if (slug === NEW_GUIDE_VALUE) {
      startNewGuide();
      return;
    }

    setSelectedSlug(slug);
    setGuide(null);
    setMessage(null);
    setError(null);
    setSlugTouched(true);
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

  function updateTitle(title: string) {
    setGuide((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        title,
        slug: isNewGuide && !slugTouched ? slugify(title) : current.slug,
      };
    });
  }

  async function saveGuide() {
    if (!guide) {
      return;
    }

    setSaving(true);
    setMessage(null);
    setError(null);

    const eventTypes = commaSeparatedValues(eventTypesText);
    const tags = commaSeparatedValues(tagsText);

    try {
      const response = await fetch(
        isNewGuide
          ? "/api/admin/content/guides"
          : "/api/admin/content/guide-editor",
        {
          method: isNewGuide ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...guide, eventTypes, tags }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ||
            (isNewGuide
              ? "The guide could not be created."
              : "The guide could not be saved."),
        );
      }

      if (isNewGuide) {
        const savedGuide: EditableGuide = {
          ...guide,
          slug: payload.slug,
          eventTypes,
          tags,
        };

        setGuides((current) =>
          [...current, summaryForGuide(savedGuide)].sort((left, right) =>
            left.title.localeCompare(right.title),
          ),
        );
        setSelectedSlug(savedGuide.slug);
        setGuide(savedGuide);
        setSlugTouched(true);
        setEventTypesText(eventTypes.join(", "));
        setTagsText(tags.join(", "));
        setMessage(
          `${payload.message || "Guide created successfully."} It is available at ${payload.url}.`,
        );
      } else {
        const savedGuide = payload.guide as EditableGuide;

        setGuide(savedGuide);
        setGuides((current) =>
          current.map((item) =>
            item.slug === savedGuide.slug ? summaryForGuide(savedGuide) : item,
          ),
        );
        setEventTypesText(savedGuide.eventTypes.join(", "));
        setTagsText(savedGuide.tags.join(", "));
        setMessage(payload.message || "Published guide saved.");
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : isNewGuide
            ? "The guide could not be created."
            : "The guide could not be saved.",
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
          <h1>Guide creator / editor</h1>
          <p>
            Create a new guide or edit every field of an existing guide from the same
            screen. Existing guide URLs stay unchanged.
          </p>
        </div>
        <Link href="/admin">Admin panel</Link>
      </header>

      {message && <p className="notice success">{message}</p>}
      {error && <p className="notice error" role="alert">{error}</p>}

      <section className="editor-card">
        <div className="guide-picker">
          <label>
            Guide
            <select
              value={selectedSlug}
              onChange={(event) => void chooseGuide(event.target.value)}
            >
              <option value={NEW_GUIDE_VALUE}>Create a new guide</option>
              {guides.map((item) => (
                <option key={item.slug} value={item.slug}>
                  Edit: {item.title}
                </option>
              ))}
            </select>
          </label>
          {!isNewGuide && (
            <button type="button" className="secondary" onClick={startNewGuide}>
              + New guide
            </button>
          )}
        </div>

        {loading && <p className="muted">Loading guide…</p>}

        {guide && (
          <>
            <div className="selected-guide">
              <div>
                <span>/guides/{guide.slug || "new-guide"}</span>
                <h2>{isNewGuide ? "Create a new guide" : guide.title}</h2>
              </div>
              {!isNewGuide && (
                <Link href={`/guides/${guide.slug}`} target="_blank">
                  View published guide ↗
                </Link>
              )}
            </div>

            <section className="metadata-grid" aria-label="Guide metadata">
              <label className="wide">
                Title
                <input
                  required
                  value={guide.title}
                  onChange={(event) => updateTitle(event.target.value)}
                />
              </label>

              <label className="wide">
                Slug
                <input
                  required
                  disabled={!isNewGuide}
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  value={guide.slug}
                  placeholder="guide-url-slug"
                  onChange={(event) => {
                    setSlugTouched(true);
                    setGuide((current) =>
                      current && { ...current, slug: slugify(event.target.value) },
                    );
                  }}
                />
                <small>
                  {isNewGuide
                    ? "This becomes the guide URL and cannot be changed after creation."
                    : "Published guide URLs remain fixed."}
                </small>
              </label>

              <label className="wide">
                Description
                <textarea
                  required={isNewGuide}
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
                      current && { ...current, series: slugify(event.target.value) },
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
                  disabled={!guide.series}
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
              {guides.length === 0 ? (
                <p className="muted">Create another guide before adding cross-links.</p>
              ) : (
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
              )}
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
                required
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
              disabled={saving || !guide.title.trim() || !guide.slug.trim() || !guide.body.trim()}
              onClick={() => void saveGuide()}
            >
              {saving
                ? isNewGuide
                  ? "Creating…"
                  : "Saving…"
                : isNewGuide
                  ? "Create guide"
                  : "Save guide"}
            </button>
          </>
        )}
      </section>

      <style jsx>{`
        .guide-editor-admin { padding-top: 28px; padding-bottom: 60px; }
        .page-header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 22px; }
        .page-header h1 { margin: 0; font-size: clamp(2rem, 6vw, 3.2rem); }
        .page-header p:last-child { max-width: 720px; color: #8b949e; line-height: 1.55; }
        .page-header > a { color: #58a6ff; white-space: nowrap; }
        .eyebrow { margin: 0 0 6px; color: #3fb950; font-size: .75rem; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
        .editor-card { display: grid; gap: 20px; padding: 22px; border: 1px solid #30363d; border-radius: 12px; background: #161b22; }
        .guide-picker { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: end; }
        label { display: grid; gap: 7px; color: #f0f6fc; font-weight: 700; }
        label small { color: #8b949e; font-weight: 400; line-height: 1.4; }
        input, select, textarea { width: 100%; box-sizing: border-box; border: 1px solid #30363d; border-radius: 7px; padding: 10px; background: #0d1117; color: #f0f6fc; font: inherit; }
        input:disabled { color: #8b949e; opacity: .75; cursor: not-allowed; }
        textarea { resize: vertical; }
        .selected-guide { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 14px; border: 1px solid #30363d; border-radius: 9px; background: #0d1117; }
        .selected-guide span { color: #79c0ff; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .75rem; }
        .selected-guide h2 { margin: 4px 0 0; }
        .selected-guide a { color: #58a6ff; white-space: nowrap; }
        .metadata-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
        .metadata-grid .wide { grid-column: 1 / -1; }
        .related-guides { margin: 0; border: 1px solid #30363d; border-radius: 9px; padding: 14px; }
        .related-guides legend { padding: 0 7px; color: #f0f6fc; font-weight: 800; }
        .related-guides p { margin: 0; }
        .related-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 9px; }
        .checkbox-label { display: flex; grid-template-columns: none; align-items: flex-start; gap: 8px; padding: 8px; border-radius: 6px; background: #0d1117; font-weight: 500; }
        .checkbox-label input { width: auto; margin-top: 3px; }
        .code-input { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .86rem; line-height: 1.55; }
        .primary, .secondary { border: 0; border-radius: 8px; padding: 11px 17px; color: #fff; font-weight: 800; cursor: pointer; }
        .primary { background: #238636; }
        .secondary { border: 1px solid #30363d; background: #21262d; }
        .save-button { justify-self: start; }
        .primary:disabled { opacity: .6; cursor: not-allowed; }
        .notice { padding: 11px 14px; border-radius: 8px; }
        .notice.success { border: 1px solid #238636; background: rgba(35,134,54,.15); }
        .notice.error { border: 1px solid #f85149; background: rgba(248,81,73,.12); }
        .muted { color: #8b949e; }
        @media (max-width: 800px) {
          .page-header, .selected-guide { flex-direction: column; align-items: flex-start; }
          .metadata-grid { grid-template-columns: 1fr; }
          .metadata-grid .wide { grid-column: auto; }
        }
        @media (max-width: 620px) {
          .guide-picker { grid-template-columns: 1fr; }
          .secondary { justify-self: start; }
        }
      `}</style>
    </main>
  );
}
