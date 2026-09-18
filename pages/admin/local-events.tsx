import Link from "next/link";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import { useMemo, useState, type FormEvent } from "react";
import EventCard from "../../components/events/EventCard";
import type { PokemonGoEventSummary } from "../../lib/events";
import {
  readLocalEvents,
  type LocalEvent,
  type LocalEventInput,
} from "../../lib/local-events";
import { authOptions } from "../api/auth/[...nextauth]";

interface ManualEventsAdminProps {
  initialEvents: LocalEvent[];
}

interface EventDraft {
  name: string;
  eventType: string;
  heading: string;
  description: string;
  start: string;
  end: string;
  campfireUrl: string;
  image: string;
  tags: string;
}

const EMPTY_DRAFT: EventDraft = {
  name: "",
  eventType: "local-event",
  heading: "Local Event",
  description: "",
  start: "",
  end: "",
  campfireUrl: "",
  image: "",
  tags: "",
};

function toDateTimeLocal(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function eventToDraft(event: LocalEvent): EventDraft {
  return {
    name: event.name,
    eventType: event.eventType,
    heading: event.heading,
    description: event.description ?? "",
    start: toDateTimeLocal(event.start),
    end: toDateTimeLocal(event.end),
    campfireUrl: event.campfireUrl ?? "",
    image: event.image ?? "",
    tags: event.tags.join(", "),
  };
}

function draftToInput(draft: EventDraft): LocalEventInput {
  return {
    name: draft.name,
    eventType: draft.eventType,
    heading: draft.heading,
    description: draft.description,
    start: new Date(draft.start).toISOString(),
    end: new Date(draft.end).toISOString(),
    campfireUrl: draft.campfireUrl,
    image: draft.image,
    tags: draft.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export const getServerSideProps: GetServerSideProps<ManualEventsAdminProps> = async (
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
    },
  };
};

export default function ManualEventsAdminPage({
  initialEvents,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [events, setEvents] = useState(initialEvents);
  const [draft, setDraft] = useState<EventDraft>(EMPTY_DRAFT);
  const [editingID, setEditingID] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo<PokemonGoEventSummary | null>(() => {
    if (
      !draft.name.trim() ||
      !draft.start ||
      !draft.end ||
      Number.isNaN(Date.parse(draft.start)) ||
      Number.isNaN(Date.parse(draft.end))
    ) {
      return null;
    }

    return {
      eventID: editingID ?? "local-preview",
      name: draft.name.trim(),
      eventType: draft.eventType.trim() || "local-event",
      heading: draft.heading.trim() || draft.eventType.trim() || "Local Event",
      link: draft.campfireUrl.trim() || null,
      image: draft.image.trim() || null,
      start: new Date(draft.start).toISOString(),
      end: new Date(draft.end).toISOString(),
      tags: draft.tags
        .split(",")
        .map((tag) => tag.trim().replace(/^#+/, ""))
        .filter(Boolean),
      description: draft.description.trim() || null,
      campfireUrl: draft.campfireUrl.trim() || null,
      source: "local",
    };
  }, [draft, editingID]);

  function resetForm() {
    setEditingID(null);
    setDraft(EMPTY_DRAFT);
  }

  function beginEdit(event: LocalEvent) {
    setEditingID(event.id);
    setDraft(eventToDraft(event));
    setMessage(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveEvent(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const url = editingID
        ? `/api/admin/local-events?id=${encodeURIComponent(editingID)}`
        : "/api/admin/local-events";
      const response = await fetch(url, {
        method: editingID ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToInput(draft)),
      });
      const payload = (await response.json()) as {
        event?: LocalEvent;
        message?: string;
        error?: string;
      };

      if (!response.ok || !payload.event) {
        throw new Error(payload.error || "The manual event could not be saved.");
      }

      const saved = payload.event;
      setEvents((current) =>
        [
          ...current.filter((event) => event.id !== saved.id),
          saved,
        ].sort((left, right) => left.start.localeCompare(right.start)),
      );
      setMessage(payload.message || "Manual event saved.");
      resetForm();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The manual event could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeEvent(event: LocalEvent) {
    if (!confirm(`Delete "${event.name}"? This cannot be undone.`)) {
      return;
    }

    setMessage(null);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/local-events?id=${encodeURIComponent(event.id)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "The manual event could not be deleted.");
      }

      setEvents((current) => current.filter((item) => item.id !== event.id));
      setMessage(payload.message || "Manual event deleted.");

      if (editingID === event.id) {
        resetForm();
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The manual event could not be deleted.",
      );
    }
  }

  return (
    <main className="container manual-events-admin">
      <header className="page-header">
        <div>
          <p className="eyebrow">Admin tools</p>
          <h1>Manual event cards</h1>
          <p>
            Create events that sit alongside the imported feed. Manual events are
            stored separately, so refreshing the upstream event data will not
            overwrite them.
          </p>
        </div>
        <div className="header-links">
          <Link href="/admin/events">Event feed</Link>
          <Link href="/events">View events</Link>
          <Link href="/admin">Admin panel</Link>
        </div>
      </header>

      {message && <p className="notice success">{message}</p>}
      {error && <p className="notice error">{error}</p>}

      <section className="editor-grid">
        <form className="event-form" onSubmit={saveEvent}>
          <div className="form-heading">
            <div>
              <p className="eyebrow">{editingID ? "Editing" : "New event"}</p>
              <h2>{editingID ? "Edit manual event" : "Create manual event"}</h2>
            </div>
            {editingID && (
              <button type="button" onClick={resetForm}>
                Cancel edit
              </button>
            )}
          </div>

          <label>
            Event name
            <input
              required
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Leigh Community Raid Day"
            />
          </label>

          <div className="two-column">
            <label>
              Event type
              <input
                required
                value={draft.eventType}
                onChange={(event) =>
                  setDraft({ ...draft, eventType: event.target.value })
                }
                placeholder="local-event"
              />
              <small>Used for filtering and ticker rules.</small>
            </label>
            <label>
              Card heading
              <input
                required
                value={draft.heading}
                onChange={(event) =>
                  setDraft({ ...draft, heading: event.target.value })
                }
                placeholder="Local Event"
              />
            </label>
          </div>

          <div className="two-column">
            <label>
              Starts
              <input
                required
                type="datetime-local"
                value={draft.start}
                onChange={(event) => setDraft({ ...draft, start: event.target.value })}
              />
            </label>
            <label>
              Ends
              <input
                required
                type="datetime-local"
                value={draft.end}
                onChange={(event) => setDraft({ ...draft, end: event.target.value })}
              />
            </label>
          </div>

          <label>
            Description
            <textarea
              rows={5}
              value={draft.description}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
              placeholder="What players need to know about this event."
            />
          </label>

          <label>
            Image URL
            <input
              type="url"
              value={draft.image}
              onChange={(event) => setDraft({ ...draft, image: event.target.value })}
              placeholder="https://..."
            />
          </label>

          <label>
            Campfire meetup URL
            <input
              type="url"
              value={draft.campfireUrl}
              onChange={(event) =>
                setDraft({ ...draft, campfireUrl: event.target.value })
              }
              placeholder="https://campfire.nianticlabs.com/..."
            />
          </label>

          <label>
            Tags
            <input
              value={draft.tags}
              onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
              placeholder="raid-day, leigh, community"
            />
            <small>Comma separated. # is optional.</small>
          </label>

          <div className="actions">
            <button className="primary" disabled={saving}>
              {saving
                ? "Saving…"
                : editingID
                  ? "Save changes"
                  : "Create event card"}
            </button>
            <button type="button" onClick={resetForm} disabled={saving}>
              Clear
            </button>
          </div>
        </form>

        <section className="preview-panel" aria-label="Event card preview">
          <p className="eyebrow">Preview</p>
          <h2>Event card</h2>
          {preview ? (
            <EventCard event={preview} />
          ) : (
            <p className="preview-empty">
              Add a name, start time and end time to preview the card.
            </p>
          )}
        </section>
      </section>

      <section className="saved-events">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Saved</p>
            <h2>Manual events</h2>
          </div>
          <span>{events.length}</span>
        </div>

        {events.length > 0 ? (
          <div className="event-list">
            {events.map((event) => (
              <article key={event.id} className="saved-event">
                <div>
                  <span className="event-type">{event.heading}</span>
                  <h3>{event.name}</h3>
                  <p>{formatDate(event.start)} – {formatDate(event.end)}</p>
                  <code>{event.id}</code>
                </div>
                <div className="row-actions">
                  <button type="button" onClick={() => beginEdit(event)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => void removeEvent(event)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty">No manual events have been created yet.</p>
        )}
      </section>

      <style jsx>{`
        .manual-events-admin { padding-top: 28px; padding-bottom: 60px; }
        .page-header, .form-heading, .section-heading, .saved-event {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          align-items: flex-start;
        }
        .page-header h1 { margin: 0; font-size: clamp(2rem, 6vw, 3.2rem); }
        .page-header p:last-child { max-width: 760px; color: #8b949e; line-height: 1.55; }
        .header-links { display: flex; flex-wrap: wrap; gap: 12px; }
        .header-links a { color: #58a6ff; white-space: nowrap; }
        .eyebrow { margin: 0 0 6px; color: #3fb950; font-size: .75rem; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
        .notice { padding: 11px 14px; border-radius: 8px; }
        .notice.success { border: 1px solid #238636; background: rgba(35,134,54,.15); }
        .notice.error { border: 1px solid #f85149; background: rgba(248,81,73,.12); }
        .editor-grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(320px, .9fr); gap: 18px; margin-top: 24px; align-items: start; }
        .event-form, .preview-panel, .saved-events { padding: 18px; border: 1px solid #30363d; border-radius: 12px; background: #161b22; }
        .event-form { display: grid; gap: 14px; }
        .event-form h2, .preview-panel h2, .saved-events h2 { margin: 0; }
        label { display: grid; gap: 7px; color: #f0f6fc; font-weight: 700; }
        label small { color: #8b949e; font-weight: 400; }
        input, textarea { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #30363d; border-radius: 7px; background: #0d1117; color: #f0f6fc; font: inherit; }
        textarea { resize: vertical; }
        .two-column { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .actions, .row-actions { display: flex; flex-wrap: wrap; gap: 8px; }
        button { border: 1px solid #30363d; border-radius: 7px; padding: 9px 12px; background: #21262d; color: #f0f6fc; font-weight: 800; cursor: pointer; }
        button:hover { border-color: #58a6ff; }
        button:disabled { cursor: wait; opacity: .65; }
        .primary { border-color: #238636; background: #238636; }
        .danger { border-color: #f85149; color: #ff7b72; background: transparent; }
        .preview-panel { position: sticky; top: 86px; display: grid; gap: 12px; }
        .preview-empty, .empty { margin: 0; padding: 24px; border: 1px dashed #30363d; border-radius: 9px; color: #8b949e; text-align: center; }
        .saved-events { margin-top: 20px; }
        .section-heading { align-items: center; margin-bottom: 14px; }
        .section-heading > span { padding: 5px 9px; border-radius: 999px; background: #21262d; color: #8b949e; font-weight: 800; }
        .event-list { display: grid; gap: 10px; }
        .saved-event { align-items: center; padding: 14px; border: 1px solid #30363d; border-radius: 9px; background: #0d1117; }
        .saved-event h3 { margin: 5px 0; }
        .saved-event p { margin: 0 0 7px; color: #8b949e; }
        .saved-event code { color: #8b949e; overflow-wrap: anywhere; }
        .event-type { color: #79c0ff; font-size: .72rem; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; }
        @media (max-width: 860px) {
          .editor-grid { grid-template-columns: 1fr; }
          .preview-panel { position: static; }
        }
        @media (max-width: 620px) {
          .page-header, .saved-event { flex-direction: column; }
          .two-column { grid-template-columns: 1fr; }
          .row-actions { width: 100%; }
        }
      `}</style>
    </main>
  );
}
