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
  const [keywords, setKeywords] = useState(initialSettings.nameKeywords.join(", "));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const summaries = useMemo(() => eventTypeSummaries(initialEvents), [initialEvents]);
  const missingEvents = useMemo(
    () =>
      eventsMissingCampfireMeetups(
        initialEvents,
        initialOverrides,
        {
          ...settings,
          nameKeywords: keywords
            .split(",")
            .map((value) => value.trim().toLowerCase())
            .filter(Boolean),
        },
      ),
    [initialEvents, initialOverrides, settings, keywords],
  );

  function toggleEventType(eventType: string) {
    setSettings((current) => ({
      ...current,
      eventTypes: current.eventTypes.includes(eventType)
        ? current.eventTypes.filter((value) => value !== eventType)
        : [...current.eventTypes, eventType],
    }));
  }

  function useRecommendedDefaults() {
    setSettings(DEFAULT_CAMPFIRE_REMINDER_SETTINGS);
    setKeywords(DEFAULT_CAMPFIRE_REMINDER_SETTINGS.nameKeywords.join(", "));
    setMessage(null);
    setError(null);
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

      <section className={`reminder-summary${missingEvents.length > 0 ? " attention" : " clear"}`}>
        <div>
          <strong>{missingEvents.length}</strong>
          <span>upcoming event{missingEvents.length === 1 ? "" : "s"} currently need a Campfire meetup</span>
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
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="settings-panel">
        <div className="settings-heading">
          <div>
            <h2>Reminder rules</h2>
            <p>
              An event triggers a reminder when it matches any selected event type,
              any keyword, or the weekend rule.
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
            <small>Warn for any event whose date range includes a Saturday or Sunday.</small>
          </span>
        </label>

        <label className="keywords">
          Event name / heading keywords
          <input
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            placeholder="raid hour, raid day, go fest"
          />
          <small>
            Comma separated. This catches special event families even when their feed
            event type is generic.
          </small>
        </label>

        <fieldset>
          <legend>Imported event types</legend>
          <p>Select any feed categories that should always require a Campfire reminder.</p>
          <div className="type-grid">
            {summaries.map((summary) => (
              <label key={summary.eventType}>
                <input
                  type="checkbox"
                  checked={settings.eventTypes.includes(summary.eventType)}
                  onChange={() => toggleEventType(summary.eventType)}
                />
                <span>
                  <strong>{summary.label}</strong>
                  <small>{summary.eventType} · {summary.count} upcoming</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="actions">
          <button type="button" className="primary" disabled={saving} onClick={saveSettings}>
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
        .missing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 10px; }
        .missing-grid article { padding: 13px; border: 1px solid #d29922; border-radius: 9px; background: #161b22; }
        .missing-grid article > span { color: #f2cc60; font-size: .7rem; font-weight: 900; text-transform: uppercase; }
        .missing-grid h3 { margin: 5px 0; font-size: 1rem; }
        .missing-grid p { margin: 0 0 6px; color: #8b949e; font-size: .82rem; }
        .missing-grid code { color: #79c0ff; font-size: .72rem; }
        .settings-panel { display: grid; gap: 18px; padding: 18px; border: 1px solid #30363d; border-radius: 11px; background: #161b22; }
        .settings-heading { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
        .settings-heading h2 { margin: 0 0 5px; }
        .settings-heading p, fieldset > p { margin: 0; color: #8b949e; line-height: 1.5; }
        .weekend-toggle { display: flex; gap: 10px; align-items: flex-start; padding: 12px; border: 1px solid #30363d; border-radius: 8px; }
        .weekend-toggle input, .type-grid input { width: auto; margin-top: 3px; }
        .weekend-toggle span, .type-grid span { display: grid; gap: 3px; }
        small { color: #8b949e; font-weight: 400; line-height: 1.4; }
        .keywords { display: grid; gap: 7px; font-weight: 800; }
        input { box-sizing: border-box; width: 100%; padding: 10px; border: 1px solid #30363d; border-radius: 7px; background: #0d1117; color: #f0f6fc; font: inherit; }
        fieldset { padding: 14px; border: 1px solid #30363d; border-radius: 8px; }
        legend { padding: 0 5px; font-weight: 900; }
        .type-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 8px; margin-top: 12px; }
        .type-grid label { display: flex; gap: 8px; padding: 9px; border: 1px solid #30363d; border-radius: 7px; background: #0d1117; }
        .actions { display: flex; gap: 8px; }
        button { border: 1px solid #30363d; border-radius: 7px; padding: 9px 12px; background: #21262d; color: #f0f6fc; font-weight: 800; cursor: pointer; }
        button:hover { border-color: #58a6ff; }
        button:disabled { cursor: wait; opacity: .65; }
        .primary { border-color: #238636; background: #238636; }
        @media (max-width: 700px) {
          .page-header, .settings-heading, .reminder-summary { flex-direction: column; align-items: stretch; }
          .reminder-summary div { align-items: flex-start; }
        }
      `}</style>
    </main>
  );
}
