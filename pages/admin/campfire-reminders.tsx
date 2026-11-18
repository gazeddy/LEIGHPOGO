import Link from "next/link";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import { useMemo, useState } from "react";
import {
  DEFAULT_CAMPFIRE_REMINDER_SETTINGS,
  eventsMissingCampfireMeetups,
  type CampfireReminderSettings,
} from "../../lib/campfire-reminder-rules";
import { readCampfireReminderSettings } from "../../lib/campfire-reminder-settings";
import { readEventOverrides, type EventOverride } from "../../lib/event-overrides";
import type { PokemonGoEventSummary } from "../../lib/events";
import { getImportedEventsForAdmin } from "../../lib/events-server";
import { authOptions } from "../api/auth/[...nextauth]";

interface Props {
  initialEvents: PokemonGoEventSummary[];
  initialOverrides: EventOverride[];
  initialSettings: CampfireReminderSettings;
  warning: string | null;
}

interface TypeSummary {
  eventType: string;
  label: string;
  count: number;
}

type ReminderMode = "on" | "auto" | "off";

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

function eventTypeSummaries(events: PokemonGoEventSummary[]): TypeSummary[] {
  const grouped = new Map<string, { count: number; headings: Map<string, number> }>();

  for (const event of events) {
    const eventType = event.eventType.trim().toLowerCase();
    if (!eventType) continue;
    const current = grouped.get(eventType) ?? {
      count: 0,
      headings: new Map<string, number>(),
    };
    current.count += 1;
    current.headings.set(event.heading, (current.headings.get(event.heading) ?? 0) + 1);
    grouped.set(eventType, current);
  }

  return Array.from(grouped.entries())
    .map(([eventType, value]) => ({
      eventType,
      count: value.count,
      label:
        Array.from(value.headings.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
        eventType,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function reminderMode(
  settings: CampfireReminderSettings,
  eventType: string,
): ReminderMode {
  if (settings.eventTypes.includes(eventType)) return "on";
  if (settings.excludedEventTypes.includes(eventType)) return "off";
  return "auto";
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
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

  const [feed, overrides, settings] = await Promise.all([
    getImportedEventsForAdmin(240),
    readEventOverrides(),
    readCampfireReminderSettings(),
  ]);

  return {
    props: {
      initialEvents: feed.events,
      initialOverrides: overrides,
      initialSettings: settings,
      warning: feed.warning,
    },
  };
};

export default function CampfireReminderAdminPage({
  initialEvents,
  initialOverrides,
  initialSettings,
  warning,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [settings, setSettings] = useState(initialSettings);
  const [overrides, setOverrides] = useState(initialOverrides);
  const [keywords, setKeywords] = useState(initialSettings.nameKeywords.join(", "));
  const [campfireLinks, setCampfireLinks] = useState<Record<string, string>>({});
  const [savingEventID, setSavingEventID] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const summaries = useMemo(() => eventTypeSummaries(initialEvents), [initialEvents]);
  const missingEvents = useMemo(
    () =>
      eventsMissingCampfireMeetups(
        initialEvents,
        overrides,
        {
          ...settings,
          nameKeywords: keywords
            .split(",")
            .map((value) => value.trim().toLowerCase())
            .filter(Boolean),
        },
      ),
    [initialEvents, overrides, settings, keywords],
  );

  function cycleEventType(eventType: string) {
    setSettings((current) => {
      const mode = reminderMode(current, eventType);

      if (mode === "on") {
        return {
          ...current,
          eventTypes: current.eventTypes.filter((value) => value !== eventType),
          excludedEventTypes: Array.from(
            new Set([...current.excludedEventTypes, eventType]),
          ),
        };
      }

      if (mode === "off") {
        return {
          ...current,
          excludedEventTypes: current.excludedEventTypes.filter(
            (value) => value !== eventType,
          ),
        };
      }

      return {
        ...current,
        eventTypes: Array.from(new Set([...current.eventTypes, eventType])),
        excludedEventTypes: current.excludedEventTypes.filter(
          (value) => value !== eventType,
        ),
      };
    });
    setMessage(null);
    setError(null);
  }

  function useRecommendedDefaults() {
    setSettings({
      ...DEFAULT_CAMPFIRE_REMINDER_SETTINGS,
      eventTypes: [...DEFAULT_CAMPFIRE_REMINDER_SETTINGS.eventTypes],
      excludedEventTypes: [
        ...DEFAULT_CAMPFIRE_REMINDER_SETTINGS.excludedEventTypes,
      ],
      nameKeywords: [...DEFAULT_CAMPFIRE_REMINDER_SETTINGS.nameKeywords],
    });
    setKeywords(DEFAULT_CAMPFIRE_REMINDER_SETTINGS.nameKeywords.join(", "));
    setMessage(null);
    setError(null);
  }

  async function saveCampfireLink(event: PokemonGoEventSummary) {
    const campfireUrl = (campfireLinks[event.eventID] ?? "").trim();
    if (!campfireUrl) {
      setError("Paste a Campfire meetup link before saving.");
      return;
    }

    const existing = overrides.find((override) => override.eventID === event.eventID);
    setSavingEventID(event.eventID);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/event-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventID: event.eventID,
          name: existing?.name ?? event.name,
          heading: existing?.heading ?? event.heading,
          description: existing?.description ?? event.description ?? null,
          campfireUrl,
          campfireMeetups: existing?.campfireMeetups ?? [],
          image: existing?.image ?? event.image ?? null,
          tags: existing?.tags ?? event.tags ?? [],
          hidden: existing?.hidden ?? false,
          hideAt: existing?.hideAt ?? null,
        }),
      });
      const payload = (await response.json()) as {
        override?: EventOverride;
        message?: string;
        error?: string;
      };

      if (!response.ok || !payload.override) {
        throw new Error(payload.error || "Campfire meetup link could not be saved.");
      }

      setOverrides((current) => [
        ...current.filter((override) => override.eventID !== payload.override?.eventID),
        payload.override as EventOverride,
      ]);
      setCampfireLinks((current) => {
        const next = { ...current };
        delete next[event.eventID];
        return next;
      });
      setMessage(payload.message || `Campfire meetup saved for ${event.name}.`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Campfire meetup link could not be saved.",
      );
    } finally {
      setSavingEventID(null);
    }
  }

  async function saveSettings() {
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/campfire-reminder-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventTypes: settings.eventTypes,
          excludedEventTypes: settings.excludedEventTypes,
          nameKeywords: keywords
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          includeWeekendEvents: settings.includeWeekendEvents,
        }),
      });
      const payload = (await response.json()) as {
        settings?: CampfireReminderSettings;
        message?: string;
        error?: string;
      };

      if (!response.ok || !payload.settings) {
        throw new Error(payload.error || "Reminder settings could not be saved.");
      }

      setSettings(payload.settings);
      setKeywords(payload.settings.nameKeywords.join(", "));
      setMessage(payload.message || "Campfire meetup reminder settings saved.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Reminder settings could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="container reminder-admin">
      <header className="page-header">
        <div>
          <p className="eyebrow">Admin tools</p>
          <h1>Campfire meetup reminders</h1>
          <p>
            Choose which imported events should warn administrators when no Campfire
            meetup has been configured. The reminder is advisory only and never hides
            or changes a public event.
          </p>
        </div>
        <div className="header-links">
          <Link href="/admin/events">Event feed</Link>
          <Link href="/admin">Admin panel</Link>
        </div>
      </header>

      {warning && <p className="notice warning">{warning}</p>}
      {message && <p className="notice success">{message}</p>}
      {error && <p className="notice error">{error}</p>}

      <section
        className={`reminder-summary${missingEvents.length > 0 ? " attention" : " clear"}`}
      >
        <div>
          <strong>{missingEvents.length}</strong>
          <span>
            upcoming event{missingEvents.length === 1 ? "" : "s"} currently need a
            Campfire meetup
          </span>
        </div>
        <Link href="/admin/events">Open event feed</Link>
      </section>

      {missingEvents.length > 0 && (
        <section className="missing-events" aria-label="Events missing Campfire meetups">
          <h2>Meetups to add</h2>
          <div className="missing-grid">
            {missingEvents.map((event) => (
              <article key={event.eventID}>
                <span>{event.heading}</span>
                <h3>{event.name}</h3>
                <p>{formatDate(event.start)}</p>
                <code>{event.eventType}</code>
                <form
                  className="quick-campfire"
                  onSubmit={(submitEvent) => {
                    submitEvent.preventDefault();
                    void saveCampfireLink(event);
                  }}
                >
                  <input
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    aria-label={`Campfire meetup link for ${event.name}`}
                    placeholder="https://cmpf.re/..."
                    value={campfireLinks[event.eventID] ?? ""}
                    onChange={(inputEvent) =>
                      setCampfireLinks((current) => ({
                        ...current,
                        [event.eventID]: inputEvent.target.value,
                      }))
                    }
                  />
                  <button
                    type="submit"
                    className="quick-save"
                    disabled={savingEventID === event.eventID}
                  >
                    {savingEventID === event.eventID ? "Saving…" : "Save Campfire"}
                  </button>
                </form>
              </article>
            ))}
          </div>
          <p className="multi-day-note">
            For events with different Campfire meetups on different days, use the Event
            Feed editor to add the full day-by-day schedule.
          </p>
        </section>
      )}

      <section className="settings-panel">
        <div className="settings-heading">
          <div>
            <h2>Reminder rules</h2>
            <p>
              Event types can be forced ON, forced OFF, or left on AUTO so keywords
              and the weekend rule can decide.
            </p>
          </div>
          <button type="button" onClick={useRecommendedDefaults}>
            Use recommended defaults
          </button>
        </div>

        <label className="weekend-toggle">
          <input
            type="checkbox"
            checked={settings.includeWeekendEvents}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                includeWeekendEvents: event.target.checked,
              }))
            }
          />
          <span>
            <strong>Weekend events</strong>
            <small>
              Warn for AUTO event types whose date range includes a Saturday or Sunday.
            </small>
          </span>
        </label>

        <label className="keywords">
          Event name / heading keywords
          <input
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            placeholder="go fest"
          />
          <small>
            Comma separated. Keywords apply only to AUTO event types; OFF always wins.
          </small>
        </label>

        <fieldset>
          <legend>Imported event types</legend>
          <p>
            Tap a type to cycle ON → OFF → AUTO. ON always reminds. OFF never reminds.
            AUTO uses the keyword and weekend rules above.
          </p>
          <div className="type-grid">
            {summaries.map((summary) => {
              const mode = reminderMode(settings, summary.eventType);

              return (
                <button
                  key={summary.eventType}
                  type="button"
                  className={`type-toggle ${mode}`}
                  data-mode={mode}
                  aria-label={`${summary.label}: ${mode.toUpperCase()}`}
                  onClick={() => cycleEventType(summary.eventType)}
                >
                  <span className="type-toggle-state" aria-hidden="true">
                    {mode.toUpperCase()}
                  </span>
                  <span className="type-toggle-copy">
                    <strong>{summary.label}</strong>
                    <small>
                      {summary.eventType} · {summary.count} upcoming
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="actions">
          <button
            type="button"
            className="primary"
            disabled={saving}
            onClick={saveSettings}
          >
            {saving ? "Saving…" : "Save reminder rules"}
          </button>
        </div>
      </section>

      <style jsx>{`
        .reminder-admin { padding-top: 28px; padding-bottom: 60px; }
        .page-header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
        .page-header h1 { margin: 0; font-size: clamp(2rem, 6vw, 3.2rem); }
        .page-header p:last-child { max-width: 760px; color: #8b949e; line-height: 1.55; }
        .eyebrow { margin: 0 0 6px; color: #3fb950; font-size: .75rem; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
        .header-links { display: flex; flex-wrap: wrap; gap: 12px; }
        .header-links a { color: #58a6ff; white-space: nowrap; }
        .notice { margin: 16px 0 0; padding: 11px 14px; border-radius: 8px; }
        .notice.success { border: 1px solid #238636; background: rgba(35,134,54,.15); }
        .notice.error { border: 1px solid #f85149; background: rgba(248,81,73,.12); }
        .notice.warning { border: 1px solid #d29922; background: rgba(210,153,34,.12); }
        .reminder-summary { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin: 22px 0; padding: 16px; border-radius: 10px; }
        .reminder-summary.attention { border: 1px solid #d29922; background: rgba(210,153,34,.12); }
        .reminder-summary.clear { border: 1px solid #238636; background: rgba(35,134,54,.12); }
        .reminder-summary div { display: flex; gap: 8px; align-items: baseline; }
        .reminder-summary strong { font-size: 1.45rem; }
        .reminder-summary span { color: #c9d1d9; }
        .reminder-summary a { color: #79c0ff; font-weight: 800; }
        .missing-events { margin-bottom: 22px; }
        .missing-events h2 { margin-bottom: 10px; }
        .missing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 10px; }
        .missing-grid article { padding: 13px; border: 1px solid #d29922; border-radius: 9px; background: #161b22; }
        .missing-grid article > span { color: #f2cc60; font-size: .7rem; font-weight: 900; text-transform: uppercase; }
        .missing-grid h3 { margin: 5px 0; font-size: 1rem; }
        .missing-grid p { margin: 0 0 6px; color: #8b949e; font-size: .82rem; }
        .missing-grid code { color: #79c0ff; font-size: .72rem; }
        .quick-campfire { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 7px; margin-top: 11px; }
        .quick-campfire input { min-width: 0; }
        .quick-save { border-color: #238636; background: #238636; white-space: nowrap; }
        .multi-day-note { margin: 9px 0 0; color: #8b949e; font-size: .78rem; line-height: 1.45; }
        .settings-panel { display: grid; gap: 18px; padding: 18px; border: 1px solid #30363d; border-radius: 11px; background: #161b22; }
        .settings-heading { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
        .settings-heading h2 { margin: 0 0 5px; }
        .settings-heading p, fieldset > p { margin: 0; color: #8b949e; line-height: 1.5; }
        .weekend-toggle { display: flex; gap: 10px; align-items: flex-start; padding: 12px; border: 1px solid #30363d; border-radius: 8px; }
        .weekend-toggle input { width: auto; margin-top: 3px; }
        .weekend-toggle span { display: grid; gap: 3px; }
        small { color: #8b949e; font-weight: 400; line-height: 1.4; }
        .keywords { display: grid; gap: 7px; font-weight: 800; }
        input { box-sizing: border-box; width: 100%; padding: 10px; border: 1px solid #30363d; border-radius: 7px; background: #0d1117; color: #f0f6fc; font: inherit; }
        fieldset { padding: 14px; border: 1px solid #30363d; border-radius: 8px; }
        legend { padding: 0 5px; font-weight: 900; }
        .type-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 9px; margin-top: 12px; }
        .type-toggle { display: flex; align-items: center; gap: 10px; min-height: 58px; width: 100%; padding: 10px 12px; border: 1px solid #30363d; border-radius: 8px; background: #0d1117; color: #f0f6fc; text-align: left; touch-action: manipulation; }
        .type-toggle:hover, .type-toggle:focus-visible { border-color: #58a6ff; }
        .type-toggle.on { border-color: #238636; background: rgba(35,134,54,.18); box-shadow: inset 0 0 0 1px rgba(63,185,80,.2); }
        .type-toggle.off { border-color: #da3633; background: rgba(248,81,73,.12); box-shadow: inset 0 0 0 1px rgba(248,81,73,.15); }
        .type-toggle.auto { border-color: #6e7681; background: rgba(110,118,129,.08); }
        .type-toggle-state { flex: 0 0 48px; padding: 5px 4px; border-radius: 999px; background: #30363d; color: #c9d1d9; font-size: .66rem; font-weight: 900; text-align: center; }
        .type-toggle.on .type-toggle-state { background: #238636; color: #fff; }
        .type-toggle.off .type-toggle-state { background: #da3633; color: #fff; }
        .type-toggle.auto .type-toggle-state { background: #30363d; color: #c9d1d9; }
        .type-toggle-copy { display: grid; gap: 3px; min-width: 0; }
        .type-toggle-copy strong { color: #f0f6fc; }
        .type-toggle-copy small { overflow-wrap: anywhere; }
        .actions { display: flex; gap: 8px; }
        button { border: 1px solid #30363d; border-radius: 7px; padding: 9px 12px; background: #21262d; color: #f0f6fc; font-weight: 800; cursor: pointer; }
        button:hover { border-color: #58a6ff; }
        button:disabled { cursor: wait; opacity: .65; }
        .primary { border-color: #238636; background: #238636; }
        @media (max-width: 700px) {
          .page-header, .settings-heading, .reminder-summary { flex-direction: column; align-items: stretch; }
          .reminder-summary div { align-items: flex-start; }
          .type-grid { grid-template-columns: 1fr; }
          .type-toggle { min-height: 64px; }
          .quick-campfire { grid-template-columns: 1fr; }
          .quick-save { width: 100%; }
        }
      `}</style>
    </main>
  );
}
