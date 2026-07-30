from pathlib import Path


def replace_once(content: str, old: str, new: str, label: str) -> str:
    if old not in content:
        raise SystemExit(f"{label} was not found")
    return content.replace(old, new, 1)


ticker_path = Path("components/events/EventTicker.tsx")
ticker = ticker_path.read_text()

if 'className="ticker-event-link"' not in ticker:
    ticker = replace_once(
        ticker,
        '''          <span key={key} className="ticker-item">
            <span className="ticker-heading">{item.heading}</span>
            <span className="ticker-name">{item.name}</span>
            <time dateTime={item.start}>{formatTickerDate(item.start)}</time>
''',
        '''          <span key={key} className="ticker-item">
            <Link
              href={{ pathname: "/events", query: { event: item.eventID } }}
              className="ticker-event-link"
              tabIndex={duplicate ? -1 : undefined}
              title={`View ${item.name} on the Events page`}
            >
              <span className="ticker-heading">{item.heading}</span>
              <span className="ticker-name">{item.name}</span>
              <time dateTime={item.start}>{formatTickerDate(item.start)}</time>
            </Link>
''',
        "Ticker item block",
    )
    ticker = replace_once(
        ticker,
        '''        .ticker-heading {
          color: #79c0ff;
''',
        '''        .ticker-event-link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border-radius: 4px;
          padding: 0 4px;
          color: inherit;
          line-height: 26px;
          text-decoration: none;
        }

        .ticker-event-link:hover,
        .ticker-event-link:focus-visible {
          background: #1f2937;
          outline: none;
        }

        .ticker-event-link:hover .ticker-name,
        .ticker-event-link:focus-visible .ticker-name {
          text-decoration: underline;
        }

        .ticker-heading {
          color: #79c0ff;
''',
        "Ticker CSS insertion point",
    )
    ticker_path.write_text(ticker)


events_path = Path("pages/events/index.tsx")
events = events_path.read_text()

if "function eventTargetId" not in events:
    events = replace_once(
        events,
        'import Head from "next/head";\n',
        'import Head from "next/head";\nimport { useRouter } from "next/router";\n',
        "Router import insertion point",
    )
    events = replace_once(
        events,
        'import { useMemo, useState } from "react";',
        'import { useEffect, useMemo, useState } from "react";',
        "React import",
    )
    events = replace_once(
        events,
        '''function formatFetchedAt(value: string | null): string | null {
''',
        '''function eventTargetId(eventID: string): string {
  return `event-${encodeURIComponent(eventID)}`;
}

function formatFetchedAt(value: string | null): string | null {
''',
        "Events helper insertion point",
    )
    events = replace_once(
        events,
        '''  const { data: session } = useSession();
  const [selectedType, setSelectedType] = useState("all");
''',
        '''  const router = useRouter();
  const { data: session } = useSession();
  const [selectedType, setSelectedType] = useState("all");
''',
        "Events component state insertion point",
    )
    events = replace_once(
        events,
        '''  const formattedFetchedAt = formatFetchedAt(fetchedAt);

''',
        '''  const formattedFetchedAt = formatFetchedAt(fetchedAt);
  const selectedEventID =
    router.isReady && typeof router.query.event === "string"
      ? router.query.event
      : null;

''',
        "Selected event insertion point",
    )

    visible_block = '''  const visibleEvents = useMemo(
    () =>
      selectedType === "all"
        ? events
        : events.filter((event) => event.eventType === selectedType),
    [events, selectedType],
  );

'''
    events = replace_once(
        events,
        visible_block,
        visible_block
        + '''  useEffect(() => {
    if (!selectedEventID) {
      return;
    }

    setSelectedType("all");
    const scrollTimer = window.setTimeout(() => {
      const target = document.getElementById(eventTargetId(selectedEventID));

      if (!target) {
        return;
      }

      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      target.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
      });
      target.focus({ preventScroll: true });
    }, 0);

    return () => window.clearTimeout(scrollTimer);
  }, [selectedEventID, visibleEvents]);

''',
        "Visible events block",
    )
    events = replace_once(
        events,
        '''            {visibleEvents.map((event) => (
              <EventCard key={event.eventID} event={event} />
            ))}
''',
        '''            {visibleEvents.map((event) => {
              const isSelected = event.eventID === selectedEventID;

              return (
                <div
                  key={event.eventID}
                  id={eventTargetId(event.eventID)}
                  className={`event-target${isSelected ? " selected" : ""}`}
                  tabIndex={-1}
                >
                  <EventCard event={event} />
                </div>
              );
            })}
''',
        "Events card map",
    )

    grid_css = '''        .events-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 16px;
        }

'''
    events = replace_once(
        events,
        grid_css,
        grid_css
        + '''        .event-target {
          min-width: 0;
          border-radius: 12px;
          scroll-margin-top: 160px;
          outline: 3px solid transparent;
          transition:
            outline-color 0.2s ease,
            box-shadow 0.2s ease;
        }

        .event-target:focus {
          outline-color: transparent;
        }

        .event-target.selected {
          outline-color: #58a6ff;
          box-shadow: 0 0 0 5px rgba(88, 166, 255, 0.2);
        }

''',
        "Events grid CSS insertion point",
    )
    events_path.write_text(events)
