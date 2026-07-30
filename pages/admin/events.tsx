import Link from "next/link";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import { useMemo, useState, type FormEvent } from "react";
import {
  readEventOverrides,
  type EventOverride,
} from "../../lib/event-overrides";
import type { PokemonGoEventSummary } from "../../lib/events";
import { notifyEventVisibilityChanged } from "../../lib/event-visibility-client";
import { getImportedEventsForAdmin } from "../../lib/events-server";
import { authOptions } from "../api/auth/[...nextauth]";

interface EventFeedAdminProps {
  initialEvents: PokemonGoEventSummary[];
  initialOverrides: EventOverride[];
  fetchedAt: string;
  warning: string | null;
}

interface OverrideDraft {
  name: string;
  heading: string;
  description: string;
  campfireUrl: string;
  image: string;
  tags: string;
  hidden: boolean;
  hideAt: string;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function draftForEvent(
  event: PokemonGoEventSummary,
  override?: EventOverride,
): OverrideDraft {
  return {
    name: override?.name ?? event.name,
    heading: override?.heading ?? event.heading,
    description: override?.description ?? event.description ?? "",
    campfireUrl: override?.campfireUrl ?? event.campfireUrl ?? "",
    image: override?.image ?? event.image ?? "",
    tags: (override?.tags ?? event.tags ?? []).join(", "),
    hidden: override?.hidden ?? false,
    hideAt: toDateTimeLocal(override?.hideAt),
  };
}

export const getServerSideProps: GetServerSideProps<EventFeedAdminProps> = async (
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

  const [feed, overrides] = await Promise.all([
    getImportedEventsForAdmin(240),
    readEventOverrides(),
  ]);

  return {
    props: {
      initialEvents: feed.events,
      initialOverrides: overrides,
      fetchedAt: feed.fetchedAt,
      warning: feed.warning,
    },
  };
};

export default function EventFeedAdminPage({
  initialEvents,
  initialOverrides,
  fetchedAt,
  warning,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [overrides, setOverrides] = useState(initialOverrides);
  const [query, setQuery] = useState("");
  const [editingEventID, setEditingEventID] = useState<string | null>(null);
  const [draft, setDraft] = useState<OverrideDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const overrideByEventID = useMemo(
    () => new Map(overrides.map((override) => [override.eventID, override])),
    [overrides],
  );

  const visibleEvents = useMemo(() => {
    const search = query.trim().toLowerCase();

    if (!search) {
      return initialEvents;
    }

    return initialEvents.filter((event) =>
      [event.name, event.heading, event.eventType, ...(event.tags ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(search),
    );
  }, [initialEvents, query]);

  function beginEdit(event: PokemonGoEventSummary) {
    setEditingEventID(event.eventID);
    setDraft(draftForEvent(event, overrideByEventID.get(event.eventID)));
    setMessage(null);
    setError(null);
  }

  function cancelEdit() {
    setEditingEventID(null);
    setDraft(null);
  }

  async function saveOverride(
    submitEvent: FormEvent,
    event: PokemonGoEventSummary,
  ) {
    submitEvent.preventDefault();

    if (!draft) {
      return;
    }

    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/event-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventID: event.eventID,
          name: draft.name,
          heading: draft.heading,
          description: draft.description,
          campfireUrl: draft.campfireUrl,
          image: draft.image,
          tags: draft.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          hidden: draft.hidden,
          hideAt: draft.hideAt
            ? new Date(draft.hideAt).toISOString()
            : null,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "The override could not be saved.");
      }

      const saved = payload.override as EventOverride;
      setOverrides((current) => [
        ...current.filter((item) => item.eventID !== saved.eventID),
        saved,
      ]);
      setMessage(payload.message);
      notifyEventVisibilityChanged();
      cancelEdit();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The override could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function resetOverride(eventID: string) {
    if (!confirm("Reset this event to the imported feed values?")) {
      return;
    }

    setMessage(null);
    setError(null);

    const response = await fetch(
      `/api/admin/event-overrides?eventID=${encodeURIComponent(eventID)}`,
      { method: "DELETE" },
    );
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error || "The override could not be reset.");
      return;
    }

    setOverrides((current) =>
      current.filter((override) => override.eventID !== eventID),
    );
    setMessage(payload.message);
    notifyEventVisibilityChanged();

    if (editingEventID === eventID) {
      cancelEdit();
    }
  }

  return (
    <main className="container event-admin">
      <header className="page-header">
        <div>
          <p className="eyebrow">Admin tools</p>
          <h1>Event feed</h1>
          <p>
            Override imported event details without changing the downloaded feed.
            A Campfire URL replaces the external event link everywhere the event
            is shown.
          </p>
        </div>
        <div className="header-links">
          <Link href="/admin/content">Content creator</Link>
          <Link href="/admin">Admin panel</Link>
        </div>
      </header>

      <section className="feed-summary">
        <div>
          <strong>{initialEvents.length}</strong>
          <span>current and upcoming imported events</span>
        </div>
        <div>
          <strong>{overrides.length}</strong>
          <span>active overrides</span>
        </div>
        <small>Feed fetched {formatDate(fetchedAt)}</small>
      </section>

      {warning && <p className="notice warning">{warning}</p>}
      {message && <p className="notice success">{message}</p>}
      {error && <p className="notice error">{error}</p>}

      <label className="search-control">
        Search imported events
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Community Day, raid hour, Pokémon name…"
        />
      </label>

      <div className="event-list">
        {visibleEvents.map((event) => {
          const override = overrideByEventID.get(event.eventID);
          const editing = editingEventID === event.eventID && draft;
          const hideReached =
            override?.hideAt && Date.parse(override.hideAt) <= Date.now();

          return (
            <article key={event.eventID} className="event-row">
              <div className="event-heading">
                <div>
                  <span className="event-type">{event.heading}</span>
                  <h2>{override?.name ?? event.name}</h2>
                  <p>{formatDate(event.start)} – {formatDate(event.end)}</p>
                </div>
                <div className="status-pills">
                  {override && <span className="overridden">Overridden</span>}
                  {override?.hidden && <span className="hidden">Hidden now</span>}
                  {override?.hideAt && !hideReached && (
                    <span className="scheduled">
                      Hides {formatDate(override.hideAt)}
                    </span>
                  )}
                  {hideReached && <span className="hidden">Auto-hidden</span>}
                </div>
              </div>

              {editing ? (
                <form onSubmit={(submitEvent) => saveOverride(submitEvent, event)}>
                  <div className="two-column">
                    <label>
                      Display name
                      <input
                        required
                        value={draft.name}
                        onChange={(changeEvent) =>
                          setDraft({ ...draft, name: changeEvent.target.value })
                        }
                      />
                    </label>
                    <label>
                      Display heading
                      <input
                        required
                        value={draft.heading}
                        onChange={(changeEvent) =>
                          setDraft({ ...draft, heading: changeEvent.target.value })
                        }
                      />
                    </label>
                  </div>

                  <label>
                    Campfire meetup URL
                    <input
                      type="url"
                      value={draft.campfireUrl}
                      placeholder="https://campfire.nianticlabs.com/..."
                      onChange={(changeEvent) =>
                        setDraft({
                          ...draft,
                          campfireUrl: changeEvent.target.value,
                        })
                      }
                    />
                    <small>
                      When set, this replaces the LeekDuck link on event cards and
                      supplies the Meetup link in the ticker.
                    </small>
                  </label>

                  <label>
                    Description
                    <textarea
                      rows={4}
                      value={draft.description}
                      onChange={(changeEvent) =>
                        setDraft({
                          ...draft,
                          description: changeEvent.target.value,
                        })
                      }
                    />
                  </label>

                  <div className="two-column">
                    <label>
                      Image URL
                      <input
                        type="url"
                        value={draft.image}
                        onChange={(changeEvent) =>
                          setDraft({ ...draft, image: changeEvent.target.value })
                        }
                      />
                    </label>
                    <label>
                      Tags, comma separated
                      <input
                        value={draft.tags}
                        onChange={(changeEvent) =>
                          setDraft({ ...draft, tags: changeEvent.target.value })
                        }
                      />
                    </label>
                  </div>

                  <fieldset>
                    <legend>Visibility</legend>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={draft.hidden}
                        onChange={(changeEvent) =>
                          setDraft({ ...draft, hidden: changeEvent.target.checked })
                        }
                      />
                      Hide this event immediately everywhere
                    </label>
                    <label>
                      Automatically hide from
                      <input
                        type="datetime-local"
                        value={draft.hideAt}
                        onChange={(changeEvent) =>
                          setDraft({ ...draft, hideAt: changeEvent.target.value })
                        }
                      />
                      <small>
                        Leave blank to keep it visible until the normal event-end
                        filtering removes it.
                      </small>
                    </label>
                  </fieldset>

                  <div className="actions">
                    <button className="primary" disabled={saving}>
                      {saving ? "Saving…" : "Save override"}
                    </button>
                    <button type="button" onClick={cancelEdit}>Cancel</button>
                    {override && (
                      <button
                        type="button"
                        className="danger"
                        onClick={() => resetOverride(event.eventID)}
                      >
                        Reset override
                      </button>
                    )}
                  </div>
                </form>
              ) : (
                <div className="event-details">
                  <div>
                    <small>Imported ID</small>
                    <code>{event.eventID}</code>
                  </div>
                  <div>
                    <small>Current destination</small>
                    <span>
                      {override?.campfireUrl || event.link || "No external link"}
                    </span>
                  </div>
                  <div className="row-actions">
                    <button type="button" onClick={() => beginEdit(event)}>
                      {override ? "Edit override" : "Override event"}
                    </button>
                    {override && (
                      <button
                        type="button"
                        className="danger"
                        onClick={() => resetOverride(event.eventID)}
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {visibleEvents.length === 0 && (
        <p className="empty">No imported events match that search.</p>
      )}

      <style jsx>{`
        .event-admin { padding-top: 28px; padding-bottom: 60px; }
        .page-header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
        .page-header h1 { margin: 0; font-size: clamp(2rem, 6vw, 3.2rem); }
        .page-header p:last-child { max-width: 760px; color: #8b949e; line-height: 1.55; }
        .eyebrow { margin: 0 0 6px; color: #3fb950; font-size: .75rem; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
        .header-links { display: flex; flex-wrap: wrap; gap: 12px; }
        .header-links a { color: #58a6ff; white-space: nowrap; }
        .feed-summary { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin: 22px 0; padding: 14px; border: 1px solid #30363d; border-radius: 10px; background: #161b22; }
        .feed-summary div { display: flex; gap: 7px; align-items: baseline; }
        .feed-summary strong { font-size: 1.2rem; color: #f0f6fc; }
        .feed-summary span, .feed-summary small { color: #8b949e; }
        .feed-summary small { margin-left: auto; }
        .notice { padding: 11px 14px; border-radius: 8px; }
        .notice.success { border: 1px solid #238636; background: rgba(35,134,54,.15); }
        .notice.error { border: 1px solid #f85149; background: rgba(248,81,73,.12); }
        .notice.warning { border: 1px solid #d29922; background: rgba(210,153,34,.12); }
        .search-control { display: grid; gap: 7px; margin: 18px 0; font-weight: 800; }
        input, textarea { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #30363d; border-radius: 7px; background: #0d1117; color: #f0f6fc; font: inherit; }
        textarea { resize: vertical; }
        .event-list { display: grid; gap: 14px; }
        .event-row { padding: 18px; border: 1px solid #30363d; border-radius: 11px; background: #161b22; }
        .event-heading { display: flex; justify-content: space-between; gap: 16px; }
        .event-heading h2 { margin: 4px 0; font-size: 1.2rem; }
        .event-heading p { margin: 0; color: #8b949e; }
        .event-type { color: #79c0ff; font-size: .72rem; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; }
        .status-pills { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; align-content: flex-start; }
        .status-pills span { padding: 5px 8px; border-radius: 999px; font-size: .7rem; font-weight: 800; }
        .overridden { background: #1f6feb; color: #fff; }
        .hidden { background: #da3633; color: #fff; }
        .scheduled { background: #9e6a03; color: #fff; }
        form { display: grid; gap: 14px; margin-top: 18px; padding-top: 16px; border-top: 1px solid #30363d; }
        label, fieldset { display: grid; gap: 7px; color: #f0f6fc; font-weight: 700; }
        label small { color: #8b949e; font-weight: 400; line-height: 1.45; }
        .two-column { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        fieldset { padding: 12px; border: 1px solid #30363d; border-radius: 8px; }
        .checkbox-label { display: flex; gap: 9px; align-items: center; }
        .checkbox-label input { width: auto; }
        .actions, .row-actions { display: flex; flex-wrap: wrap; gap: 8px; }
        button { border: 1px solid #30363d; border-radius: 7px; padding: 9px 12px; background: #21262d; color: #f0f6fc; font-weight: 800; cursor: pointer; }
        button:hover { border-color: #58a6ff; }
        .primary { border-color: #238636; background: #238636; }
        .danger { border-color: #f85149; color: #ff7b72; background: transparent; }
        .event-details { display: grid; grid-template-columns: minmax(180px, .8fr) minmax(220px, 1.4fr) auto; gap: 14px; align-items: end; margin-top: 15px; padding-top: 14px; border-top: 1px solid #30363d; }
        .event-details > div:not(.row-actions) { display: grid; gap: 4px; min-width: 0; }
        .event-details small { color: #8b949e; }
        .event-details code, .event-details span { overflow-wrap: anywhere; }
        .empty { padding: 28px; text-align: center; color: #8b949e; }
        @media (max-width: 800px) {
          .page-header, .event-heading { flex-direction: column; }
          .status-pills { justify-content: flex-start; }
          .event-details { grid-template-columns: 1fr; align-items: start; }
          .feed-summary small { width: 100%; margin-left: 0; }
        }
        @media (max-width: 620px) { .two-column { grid-template-columns: 1fr; } }
      `}</style>
    </main>
  );
}
