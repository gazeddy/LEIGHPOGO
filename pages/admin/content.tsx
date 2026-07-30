import Link from "next/link";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  EVENT_TAG_SUGGESTIONS,
  EVENT_TYPE_OPTIONS,
  type EventTypeOption,
} from "../../lib/event-options";
import { getAllGuides, type GuideSummary } from "../../lib/guides";
import { readLocalEvents, type LocalEvent } from "../../lib/local-events";
import { authOptions } from "../api/auth/[...nextauth]";

interface ContentPageProps {
  initialEvents: LocalEvent[];
  initialGuides: GuideSummary[];
  eventTypes: EventTypeOption[];
}

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  label: string;
}

function normaliseTag(value: string): string {
  return value.trim().toLowerCase().replace(/^#+/, "").replace(/\s+/g, "-");
}

function TagInput({ tags, onChange, suggestions = [], label }: TagInputProps) {
  const [draft, setDraft] = useState("");

  function addTag(value: string) {
    const tag = normaliseTag(value);

    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag]);
    }

    setDraft("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(draft);
    }

    if (event.key === "Backspace" && !draft && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="tag-control">
      <label>{label}</label>
      <div className="tag-box">
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            className="tag-pill"
            onClick={() => onChange(tags.filter((item) => item !== tag))}
            title={`Remove ${tag}`}
          >
            #{tag} ×
          </button>
        ))}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => draft && addTag(draft)}
          placeholder="Type a tag, then Enter"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="tag-suggestions">
          {suggestions
            .filter((tag) => !tags.includes(tag))
            .map((tag) => (
              <button key={tag} type="button" onClick={() => addTag(tag)}>
                + {tag}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function renderArray(name: string, values: string[]): string[] {
  return values.length > 0
    ? [name + ":", ...values.map((value) => `  - ${yamlString(value)}`)]
    : [];
}

export const getServerSideProps: GetServerSideProps<ContentPageProps> = async (
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
      initialEvents: await readLocalEvents(),
      initialGuides: getAllGuides(),
      eventTypes: EVENT_TYPE_OPTIONS,
    },
  };
};

export default function ContentCreatorPage({
  initialEvents,
  initialGuides,
  eventTypes,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [activeTab, setActiveTab] = useState<"event" | "guide">("event");
  const [events, setEvents] = useState(initialEvents);
  const [guides, setGuides] = useState(initialGuides);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [eventForm, setEventForm] = useState({
    name: "",
    eventType: eventTypes[0]?.value ?? "event",
    customEventType: "",
    heading: "",
    start: "",
    end: "",
    campfireUrl: "",
    image: "",
    description: "",
    tags: [] as string[],
  });

  const [guideForm, setGuideForm] = useState({
    title: "",
    slug: "",
    description: "",
    date: new Date().toISOString().slice(0, 10),
    order: "",
    series: "",
    seriesOrder: "",
    eventTypes: [] as string[],
    tags: [] as string[],
    relatedGuides: [] as string[],
    body: "## Introduction\n\nWrite the guide here.\n",
  });
  const [slugTouched, setSlugTouched] = useState(false);

  const existingSeries = useMemo(
    () =>
      Array.from(
        new Set(
          guides
            .map((guide) => guide.series)
            .filter((series): series is string => Boolean(series)),
        ),
      ).sort(),
    [guides],
  );

  const guidePreview = useMemo(() => {
    const lines = [
      "---",
      `title: ${yamlString(guideForm.title || "Guide title")}`,
      `description: ${yamlString(guideForm.description || "Guide description")}`,
      `date: ${yamlString(guideForm.date)}`,
    ];

    if (guideForm.order) {
      lines.push(`order: ${guideForm.order}`);
    }

    if (guideForm.series) {
      lines.push(`series: ${yamlString(guideForm.series)}`);
    }

    if (guideForm.seriesOrder) {
      lines.push(`seriesOrder: ${guideForm.seriesOrder}`);
    }

    lines.push(...renderArray("eventTypes", guideForm.eventTypes));
    lines.push(...renderArray("tags", guideForm.tags));
    lines.push(...renderArray("relatedGuides", guideForm.relatedGuides));
    lines.push("---", "", guideForm.body);

    return lines.join("\n");
  }, [guideForm]);

  function resetMessages() {
    setMessage(null);
    setError(null);
  }

  async function createEvent(event: FormEvent) {
    event.preventDefault();
    resetMessages();
    setSaving(true);

    const eventType =
      eventForm.eventType === "other"
        ? eventForm.customEventType
        : eventForm.eventType;

    try {
      const response = await fetch("/api/admin/content/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...eventForm,
          eventType,
          customEventType: undefined,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "The event could not be created.");
      }

      setEvents((current) =>
        [...current, payload.event].sort((left, right) =>
          left.start.localeCompare(right.start),
        ),
      );
      setEventForm({
        name: "",
        eventType: eventTypes[0]?.value ?? "event",
        customEventType: "",
        heading: "",
        start: "",
        end: "",
        campfireUrl: "",
        image: "",
        description: "",
        tags: [],
      });
      setMessage(payload.message);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The event could not be created.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeEvent(id: string) {
    if (!confirm("Delete this local event?")) {
      return;
    }

    resetMessages();
    const response = await fetch(
      `/api/admin/content/events?id=${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error || "The event could not be deleted.");
      return;
    }

    setEvents((current) => current.filter((event) => event.id !== id));
    setMessage(payload.message);
  }

  async function createGuide(event: FormEvent) {
    event.preventDefault();
    resetMessages();
    setSaving(true);

    try {
      const response = await fetch("/api/admin/content/guides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(guideForm),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "The guide could not be created.");
      }

      setGuides((current) => [
        ...current,
        {
          slug: payload.slug,
          title: guideForm.title,
          description: guideForm.description,
          date: guideForm.date,
          order: guideForm.order ? Number(guideForm.order) : undefined,
          series: guideForm.series || undefined,
          seriesOrder: guideForm.seriesOrder
            ? Number(guideForm.seriesOrder)
            : undefined,
          eventTypes: guideForm.eventTypes,
          tags: guideForm.tags,
          relatedGuides: guideForm.relatedGuides,
        },
      ]);
      setMessage(`${payload.message} It is available at ${payload.url}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The guide could not be created.",
      );
    } finally {
      setSaving(false);
    }
  }

  function updateGuideTitle(title: string) {
    setGuideForm((current) => ({
      ...current,
      title,
      slug: slugTouched ? current.slug : slugify(title),
    }));
  }

  function toggleGuideEventType(value: string) {
    setGuideForm((current) => ({
      ...current,
      eventTypes: current.eventTypes.includes(value)
        ? current.eventTypes.filter((item) => item !== value)
        : [...current.eventTypes, value],
    }));
  }

  function toggleRelatedGuide(slug: string) {
    setGuideForm((current) => ({
      ...current,
      relatedGuides: current.relatedGuides.includes(slug)
        ? current.relatedGuides.filter((item) => item !== slug)
        : [...current.relatedGuides, slug],
    }));
  }

  return (
    <main className="container content-admin">
      <header className="page-header">
        <div>
          <p className="eyebrow">Admin tools</p>
          <h1>Content creator</h1>
          <p>Create local calendar events and Markdown guides without building files by hand.</p>
        </div>
        <Link href="/admin">Back to admin</Link>
      </header>

      <div className="tabs" role="tablist" aria-label="Content type">
        <button
          type="button"
          className={activeTab === "event" ? "active" : ""}
          onClick={() => setActiveTab("event")}
        >
          Local event
        </button>
        <button
          type="button"
          className={activeTab === "guide" ? "active" : ""}
          onClick={() => setActiveTab("guide")}
        >
          Guide template
        </button>
      </div>

      {message && <p className="notice success">{message}</p>}
      {error && <p className="notice error">{error}</p>}

      {activeTab === "event" ? (
        <div className="content-grid">
          <form className="creator-card" onSubmit={createEvent}>
            <h2>Create a local event or meetup</h2>
            <p className="muted">
              This is merged with the imported Pokémon GO calendar and appears in the ticker.
            </p>

            <label>
              Event name
              <input
                required
                value={eventForm.name}
                onChange={(event) =>
                  setEventForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>

            <div className="two-column">
              <label>
                Event type
                <select
                  value={eventForm.eventType}
                  onChange={(event) =>
                    setEventForm((current) => ({ ...current, eventType: event.target.value }))
                  }
                >
                  {eventTypes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Display heading
                <input
                  placeholder="For example: Gigantamax"
                  value={eventForm.heading}
                  onChange={(event) =>
                    setEventForm((current) => ({ ...current, heading: event.target.value }))
                  }
                />
              </label>
            </div>

            {eventForm.eventType === "other" && (
              <label>
                Custom event type
                <input
                  required
                  placeholder="lowercase-with-hyphens"
                  value={eventForm.customEventType}
                  onChange={(event) =>
                    setEventForm((current) => ({
                      ...current,
                      customEventType: event.target.value,
                    }))
                  }
                />
              </label>
            )}

            <div className="two-column">
              <label>
                Starts
                <input
                  required
                  type="datetime-local"
                  value={eventForm.start}
                  onChange={(event) =>
                    setEventForm((current) => ({ ...current, start: event.target.value }))
                  }
                />
              </label>
              <label>
                Ends
                <input
                  required
                  type="datetime-local"
                  value={eventForm.end}
                  onChange={(event) =>
                    setEventForm((current) => ({ ...current, end: event.target.value }))
                  }
                />
              </label>
            </div>

            <TagInput
              label="Tags"
              tags={eventForm.tags}
              suggestions={EVENT_TAG_SUGGESTIONS}
              onChange={(tags) => setEventForm((current) => ({ ...current, tags }))}
            />

            <label>
              Campfire meetup URL
              <input
                type="url"
                placeholder="https://campfire.nianticlabs.com/..."
                value={eventForm.campfireUrl}
                onChange={(event) =>
                  setEventForm((current) => ({
                    ...current,
                    campfireUrl: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              Image URL
              <input
                type="url"
                value={eventForm.image}
                onChange={(event) =>
                  setEventForm((current) => ({ ...current, image: event.target.value }))
                }
              />
            </label>

            <label>
              Description
              <textarea
                rows={5}
                value={eventForm.description}
                onChange={(event) =>
                  setEventForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </label>

            <button className="primary" disabled={saving}>
              {saving ? "Saving…" : "Create event"}
            </button>
          </form>

          <section className="creator-card">
            <h2>Local events ({events.length})</h2>
            {events.length === 0 ? (
              <p className="muted">No local events have been created yet.</p>
            ) : (
              <div className="item-list">
                {events.map((event) => (
                  <article key={event.id}>
                    <div>
                      <strong>{event.name}</strong>
                      <small>
                        {event.eventType} · {new Date(event.start).toLocaleString("en-GB")}
                      </small>
                      {event.tags.length > 0 && (
                        <small>{event.tags.map((tag) => `#${tag}`).join(" ")}</small>
                      )}
                    </div>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => removeEvent(event.id)}
                    >
                      Delete
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="content-grid guide-grid">
          <form className="creator-card" onSubmit={createGuide}>
            <h2>Create a guide</h2>

            <label>
              Title
              <input
                required
                value={guideForm.title}
                onChange={(event) => updateGuideTitle(event.target.value)}
              />
            </label>

            <label>
              Slug
              <input
                required
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                value={guideForm.slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setGuideForm((current) => ({
                    ...current,
                    slug: slugify(event.target.value),
                  }));
                }}
              />
            </label>

            <label>
              Description
              <textarea
                required
                rows={3}
                value={guideForm.description}
                onChange={(event) =>
                  setGuideForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </label>

            <div className="two-column">
              <label>
                Publication date
                <input
                  type="date"
                  value={guideForm.date}
                  onChange={(event) =>
                    setGuideForm((current) => ({ ...current, date: event.target.value }))
                  }
                />
              </label>
              <label>
                Display order
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={guideForm.order}
                  onChange={(event) =>
                    setGuideForm((current) => ({ ...current, order: event.target.value }))
                  }
                />
              </label>
            </div>

            <fieldset>
              <legend>Guide sequence</legend>
              <p className="field-help">
                Guides with the same series ID receive automatic previous and next links.
              </p>
              <div className="two-column">
                <label>
                  Series ID
                  <input
                    list="guide-series-list"
                    pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                    placeholder="for example: raid-basics"
                    value={guideForm.series}
                    onChange={(event) =>
                      setGuideForm((current) => ({
                        ...current,
                        series: slugify(event.target.value),
                      }))
                    }
                  />
                  <datalist id="guide-series-list">
                    {existingSeries.map((series) => (
                      <option key={series} value={series} />
                    ))}
                  </datalist>
                </label>
                <label>
                  Position in series
                  <input
                    type="number"
                    min="1"
                    step="1"
                    disabled={!guideForm.series}
                    value={guideForm.seriesOrder}
                    onChange={(event) =>
                      setGuideForm((current) => ({
                        ...current,
                        seriesOrder: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend>Matching event types</legend>
              <div className="checkbox-grid">
                {eventTypes.map((option) => (
                  <label key={option.value} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={guideForm.eventTypes.includes(option.value)}
                      onChange={() => toggleGuideEventType(option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <TagInput
              label="Tags"
              tags={guideForm.tags}
              suggestions={EVENT_TAG_SUGGESTIONS}
              onChange={(tags) => setGuideForm((current) => ({ ...current, tags }))}
            />

            <fieldset>
              <legend>Related guides</legend>
              <p className="field-help">
                Selected guides appear in a separate related-guides section below the article.
              </p>
              {guides.length === 0 ? (
                <p className="muted">Create another guide first to add related links.</p>
              ) : (
                <div className="related-guide-grid">
                  {guides.map((guide) => (
                    <label key={guide.slug} className="checkbox-label related-guide-option">
                      <input
                        type="checkbox"
                        checked={guideForm.relatedGuides.includes(guide.slug)}
                        onChange={() => toggleRelatedGuide(guide.slug)}
                      />
                      <span>
                        <strong>{guide.title}</strong>
                        <small>{guide.slug}</small>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>

            <label>
              Guide body (Markdown)
              <textarea
                required
                rows={18}
                className="code-input"
                value={guideForm.body}
                onChange={(event) =>
                  setGuideForm((current) => ({ ...current, body: event.target.value }))
                }
              />
            </label>

            <button className="primary" disabled={saving}>
              {saving ? "Saving…" : "Create guide"}
            </button>
          </form>

          <section className="creator-card preview-card">
            <h2>Generated Markdown file</h2>
            <textarea readOnly rows={32} className="code-input" value={guidePreview} />
            <h3>Existing guides ({guides.length})</h3>
            <div className="guide-links">
              {guides.map((guide) => (
                <Link key={guide.slug} href={`/guides/${guide.slug}`}>
                  <span>{guide.title}</span>
                  {guide.series && (
                    <small>
                      {guide.series}
                      {guide.seriesOrder ? ` · Part ${guide.seriesOrder}` : ""}
                    </small>
                  )}
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}

      <style jsx>{`
        .content-admin { padding-top: 28px; padding-bottom: 60px; }
        .page-header { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; margin-bottom: 22px; }
        .page-header h1 { margin: 0; font-size: clamp(2rem, 5vw, 3rem); }
        .page-header p:last-child { color: #8b949e; }
        .page-header a { color: #58a6ff; }
        .eyebrow { margin: 0 0 6px; color: #3fb950; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; font-size: .75rem; }
        .tabs { display: flex; gap: 8px; margin-bottom: 18px; }
        .tabs button { border: 1px solid #30363d; border-radius: 8px; padding: 10px 15px; background: #161b22; color: #c9d1d9; cursor: pointer; }
        .tabs button.active { border-color: #58a6ff; color: #fff; background: #1f2937; }
        .content-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(280px, .8fr); gap: 18px; align-items: start; }
        .creator-card { padding: 22px; border: 1px solid #30363d; border-radius: 12px; background: #161b22; }
        .creator-card h2 { margin-top: 0; }
        .creator-card h3 { margin-top: 24px; }
        form { display: grid; gap: 16px; }
        label, fieldset { display: grid; gap: 7px; color: #f0f6fc; font-weight: 700; }
        input, select, textarea { width: 100%; box-sizing: border-box; border: 1px solid #30363d; border-radius: 7px; padding: 10px; background: #0d1117; color: #f0f6fc; font: inherit; }
        input:disabled { opacity: .55; cursor: not-allowed; }
        textarea { resize: vertical; }
        .two-column { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        fieldset { border: 1px solid #30363d; border-radius: 8px; padding: 12px; }
        .field-help { margin: 0 0 8px; color: #8b949e; font-size: .86rem; font-weight: 400; line-height: 1.5; }
        .checkbox-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; }
        .checkbox-label { display: flex; align-items: center; gap: 8px; font-weight: 500; }
        .checkbox-label input { width: auto; }
        .related-guide-grid { display: grid; max-height: 300px; gap: 7px; overflow-y: auto; }
        .related-guide-option { align-items: flex-start; padding: 9px; border: 1px solid #30363d; border-radius: 7px; background: #0d1117; }
        .related-guide-option span { display: grid; gap: 2px; }
        .related-guide-option small { color: #8b949e; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
        .tag-box { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-height: 44px; border: 1px solid #30363d; border-radius: 7px; padding: 6px; background: #0d1117; }
        .tag-box input { min-width: 160px; flex: 1; border: 0; padding: 5px; }
        .tag-pill { border: 0; border-radius: 999px; padding: 6px 9px; background: #1f6feb; color: #fff; cursor: pointer; }
        .tag-suggestions { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
        .tag-suggestions button { border: 1px solid #30363d; border-radius: 999px; padding: 4px 8px; background: #21262d; color: #c9d1d9; cursor: pointer; }
        .primary { justify-self: start; border: 0; border-radius: 8px; padding: 11px 17px; background: #238636; color: #fff; font-weight: 800; cursor: pointer; }
        .primary:disabled { opacity: .6; cursor: wait; }
        .danger { border: 1px solid #f85149; border-radius: 6px; padding: 6px 9px; background: transparent; color: #ff7b72; cursor: pointer; }
        .notice { padding: 11px 14px; border-radius: 8px; }
        .notice.success { border: 1px solid #238636; background: rgba(35,134,54,.15); }
        .notice.error { border: 1px solid #f85149; background: rgba(248,81,73,.12); }
        .muted { color: #8b949e; line-height: 1.55; }
        .item-list { display: grid; gap: 10px; }
        .item-list article { display: flex; justify-content: space-between; gap: 12px; padding-bottom: 10px; border-bottom: 1px solid #30363d; }
        .item-list article div { display: grid; gap: 4px; }
        .item-list small { color: #8b949e; }
        .code-input { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .85rem; line-height: 1.5; }
        .guide-links { display: grid; gap: 7px; }
        .guide-links a { display: grid; gap: 2px; padding: 8px; border-radius: 6px; color: #58a6ff; text-decoration: none; }
        .guide-links a:hover { background: #21262d; }
        .guide-links small { color: #8b949e; }
        @media (max-width: 900px) { .content-grid { grid-template-columns: 1fr; } }
        @media (max-width: 620px) { .page-header { flex-direction: column; } .two-column { grid-template-columns: 1fr; } }
      `}</style>
    </main>
  );
}
