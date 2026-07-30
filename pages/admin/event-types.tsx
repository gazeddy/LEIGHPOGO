import Link from "next/link";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  readEventTypeRules,
  type EventTypeRule,
} from "../../lib/event-overrides";
import type { PokemonGoEventSummary } from "../../lib/events";
import { notifyEventVisibilityChanged } from "../../lib/event-visibility-client";
import { getImportedEventsForAdmin } from "../../lib/events-server";
import { authOptions } from "../api/auth/[...nextauth]";

interface EventTypeAdminProps {
  initialEvents: PokemonGoEventSummary[];
  initialRules: EventTypeRule[];
  fetchedAt: string;
  warning: string | null;
  renderedAt: string;
}

interface EventTypeSummary {
  eventType: string;
  label: string;
  count: number;
  examples: string[];
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

function fallbackLabel(eventType: string): string {
  const specialWords: Record<string, string> = {
    go: "GO",
    pvp: "PvP",
  };

  return eventType
    .split("-")
    .map((word) => specialWords[word] || `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function buildEventTypeSummaries(
  events: PokemonGoEventSummary[],
): EventTypeSummary[] {
  const grouped = new Map<
    string,
    { headings: Map<string, number>; names: string[] }
  >();

  events.forEach((event) => {
    const eventType = event.eventType.trim().toLowerCase();
    const current = grouped.get(eventType) || {
      headings: new Map<string, number>(),
      names: [],
    };

    current.headings.set(
      event.heading,
      (current.headings.get(event.heading) || 0) + 1,
    );
    current.names.push(event.name);
    grouped.set(eventType, current);
  });

  return Array.from(grouped.entries())
    .map(([eventType, group]) => {
      const preferredHeading = Array.from(group.headings.entries()).sort(
        (left, right) => right[1] - left[1],
      )[0]?.[0];

      return {
        eventType,
        label: preferredHeading || fallbackLabel(eventType),
        count: group.names.length,
        examples: Array.from(new Set(group.names)).slice(0, 4),
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label));
}

function ruleIsActive(rule: EventTypeRule | undefined, now: number): boolean {
  if (!rule) {
    return false;
  }

  if (rule.hidden) {
    return true;
  }

  const hideAt = rule.hideAt ? Date.parse(rule.hideAt) : Number.NaN;
  return Number.isFinite(hideAt) && hideAt <= now;
}

interface EventTypeRuleCardProps {
  summary: EventTypeSummary;
  rule?: EventTypeRule;
  now: number;
  onSaved: (rule: EventTypeRule, message: string) => void;
  onReset: (eventType: string, message: string) => void;
  onError: (message: string) => void;
}

function EventTypeRuleCard({
  summary,
  rule,
  now,
  onSaved,
  onReset,
  onError,
}: EventTypeRuleCardProps) {
  const [hidden, setHidden] = useState(rule?.hidden ?? false);
  const [hideAt, setHideAt] = useState(toDateTimeLocal(rule?.hideAt));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setHidden(rule?.hidden ?? false);
    setHideAt(toDateTimeLocal(rule?.hideAt));
  }, [rule]);

  const hideReached = ruleIsActive(rule, now);
  const futureHide =
    rule?.hideAt && Number.isFinite(Date.parse(rule.hideAt)) && !hideReached;

  async function saveRule(event: FormEvent) {
    event.preventDefault();
    setSaving(true);

    try {
      const response = await fetch("/api/admin/event-type-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: summary.eventType,
          hidden,
          hideAt: hideAt ? new Date(hideAt).toISOString() : null,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "The event type rule could not be saved.");
      }

      onSaved(payload.rule as EventTypeRule, payload.message);
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "The event type rule could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function resetRule() {
    if (!confirm(`Reset the visibility rule for ${summary.label}?`)) {
      return;
    }

    const response = await fetch(
      `/api/admin/event-type-rules?eventType=${encodeURIComponent(summary.eventType)}`,
      { method: "DELETE" },
    );
    const payload = await response.json();

    if (!response.ok) {
      onError(payload.error || "The event type rule could not be reset.");
      return;
    }

    onReset(summary.eventType, payload.message);
  }

  return (
    <article className="type-card">
      <header>
        <div>
          <span className="type-key">{summary.eventType}</span>
          <h2>{summary.label}</h2>
          <p>{summary.count} current or upcoming imported event{summary.count === 1 ? "" : "s"}</p>
        </div>
        <div className="status-pills">
          {!rule && <span className="visible">Visible</span>}
          {rule && !hideReached && !futureHide && (
            <span className="visible">Rule saved · visible</span>
          )}
          {rule?.hidden && <span className="hidden">Hidden now</span>}
          {rule && !rule.hidden && hideReached && (
            <span className="hidden">Auto-hidden</span>
          )}
          {futureHide && rule?.hideAt && (
            <span className="scheduled">Hides {formatDate(rule.hideAt)}</span>
          )}
        </div>
      </header>

      <p className="examples">
        <strong>Examples:</strong> {summary.examples.join(" · ")}
      </p>

      <form onSubmit={saveRule}>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={hidden}
            onChange={(event) => setHidden(event.target.checked)}
          />
          Hide every imported {summary.label} event immediately
        </label>

        <label>
          Automatically hide this event type from
          <input
            type="datetime-local"
            value={hideAt}
            onChange={(event) => setHideAt(event.target.value)}
          />
          <small>
            This applies to current and future imported events with the type
            <code>{summary.eventType}</code>.
          </small>
        </label>

        <div className="actions">
          <button className="primary" disabled={saving}>
            {saving ? "Saving…" : "Save type rule"}
          </button>
          {rule && (
            <button type="button" className="danger" onClick={resetRule}>
              Reset rule
            </button>
          )}
        </div>
      </form>
    </article>
  );
}

export const getServerSideProps: GetServerSideProps<EventTypeAdminProps> = async (
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

  const [feed, rules] = await Promise.all([
    getImportedEventsForAdmin(240),
    readEventTypeRules(),
  ]);

  return {
    props: {
      initialEvents: feed.events,
      initialRules: rules,
      fetchedAt: feed.fetchedAt,
      warning: feed.warning,
      renderedAt: new Date().toISOString(),
    },
  };
};

export default function EventTypeAdminPage({
  initialEvents,
  initialRules,
  fetchedAt,
  warning,
  renderedAt,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [rules, setRules] = useState(initialRules);
  const [selectedType, setSelectedType] = useState("all");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useMemo(() => Date.parse(renderedAt), [renderedAt]);
  const summaries = useMemo(
    () => buildEventTypeSummaries(initialEvents),
    [initialEvents],
  );
  const ruleByEventType = useMemo(
    () => new Map(rules.map((rule) => [rule.eventType, rule])),
    [rules],
  );
  const visibleSummaries =
    selectedType === "all"
      ? summaries
      : summaries.filter((summary) => summary.eventType === selectedType);
  const activeRuleCount = rules.filter((rule) => ruleIsActive(rule, now)).length;

  function handleSaved(rule: EventTypeRule, nextMessage: string) {
    setRules((current) => [
      ...current.filter((item) => item.eventType !== rule.eventType),
      rule,
    ]);
    setMessage(nextMessage);
    setError(null);
    notifyEventVisibilityChanged();
  }

  function handleReset(eventType: string, nextMessage: string) {
    setRules((current) =>
      current.filter((rule) => rule.eventType !== eventType),
    );
    setMessage(nextMessage);
    setError(null);
    notifyEventVisibilityChanged();
  }

  function handleError(nextError: string) {
    setError(nextError);
    setMessage(null);
  }

  return (
    <main className="container type-admin">
      <header className="page-header">
        <div>
          <p className="eyebrow">Admin tools</p>
          <h1>Event types</h1>
          <p>
            Filter the imported feed by event type and hide whole categories such
            as Hatch Days. A hidden type is removed everywhere, including the events
            page and both ticker bars, even when an individual event has an override.
          </p>
        </div>
        <div className="header-links">
          <Link href="/admin/events">Event feed</Link>
          <Link href="/admin/content">Content creator</Link>
          <Link href="/admin">Admin panel</Link>
        </div>
      </header>

      <section className="feed-summary">
        <div>
          <strong>{summaries.length}</strong>
          <span>event types</span>
        </div>
        <div>
          <strong>{activeRuleCount}</strong>
          <span>currently hidden types</span>
        </div>
        <small>Feed fetched {formatDate(fetchedAt)}</small>
      </section>

      {warning && <p className="notice warning">{warning}</p>}
      {message && <p className="notice success">{message}</p>}
      {error && <p className="notice error">{error}</p>}

      <label className="filter-control">
        Filter by event type
        <select
          value={selectedType}
          onChange={(event) => setSelectedType(event.target.value)}
        >
          <option value="all">All event types</option>
          {summaries.map((summary) => (
            <option key={summary.eventType} value={summary.eventType}>
              {summary.label} ({summary.count})
            </option>
          ))}
        </select>
      </label>

      <div className="type-list">
        {visibleSummaries.map((summary) => (
          <EventTypeRuleCard
            key={summary.eventType}
            summary={summary}
            rule={ruleByEventType.get(summary.eventType)}
            now={now}
            onSaved={handleSaved}
            onReset={handleReset}
            onError={handleError}
          />
        ))}
      </div>

      <style jsx>{`
        .type-admin { padding-top: 28px; padding-bottom: 60px; }
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
        .filter-control { display: grid; gap: 7px; max-width: 520px; margin: 18px 0; font-weight: 800; }
        select { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #30363d; border-radius: 7px; background: #0d1117; color: #f0f6fc; font: inherit; }
        .type-list { display: grid; gap: 14px; }
        @media (max-width: 800px) {
          .page-header { flex-direction: column; }
          .feed-summary small { width: 100%; margin-left: 0; }
        }
      `}</style>

      <style jsx global>{`
        .type-card { padding: 18px; border: 1px solid #30363d; border-radius: 11px; background: #161b22; }
        .type-card > header { display: flex; justify-content: space-between; gap: 16px; }
        .type-card h2 { margin: 4px 0; font-size: 1.25rem; }
        .type-card header p { margin: 0; color: #8b949e; }
        .type-key { color: #79c0ff; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .72rem; font-weight: 900; letter-spacing: .04em; }
        .status-pills { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; align-content: flex-start; }
        .status-pills span { padding: 5px 8px; border-radius: 999px; font-size: .7rem; font-weight: 800; }
        .status-pills .visible { background: #238636; color: #fff; }
        .status-pills .hidden { background: #da3633; color: #fff; }
        .status-pills .scheduled { background: #9e6a03; color: #fff; }
        .examples { color: #8b949e; line-height: 1.5; }
        .type-card form { display: grid; gap: 14px; margin-top: 16px; padding-top: 16px; border-top: 1px solid #30363d; }
        .type-card label { display: grid; gap: 7px; color: #f0f6fc; font-weight: 700; }
        .type-card label small { display: flex; flex-wrap: wrap; gap: 5px; color: #8b949e; font-weight: 400; line-height: 1.45; }
        .type-card label code { color: #c9d1d9; }
        .type-card input[type="datetime-local"] { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #30363d; border-radius: 7px; background: #0d1117; color: #f0f6fc; font: inherit; }
        .type-card .checkbox-label { display: flex; gap: 9px; align-items: center; }
        .type-card .checkbox-label input { width: auto; }
        .type-card .actions { display: flex; flex-wrap: wrap; gap: 8px; }
        .type-card button { border: 1px solid #30363d; border-radius: 7px; padding: 9px 12px; background: #21262d; color: #f0f6fc; font-weight: 800; cursor: pointer; }
        .type-card button:hover { border-color: #58a6ff; }
        .type-card button:disabled { opacity: .6; cursor: wait; }
        .type-card .primary { border-color: #238636; background: #238636; }
        .type-card .danger { border-color: #f85149; color: #ff7b72; background: transparent; }
        @media (max-width: 800px) {
          .type-card > header { flex-direction: column; }
          .type-card .status-pills { justify-content: flex-start; }
        }
      `}</style>
    </main>
  );
}
