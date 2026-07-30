from pathlib import Path
import re
from textwrap import dedent, indent


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    source = file_path.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"Expected one literal match in {path}, found {count}: {old!r}")
    file_path.write_text(source.replace(old, new, 1))


def replace_regex_once(path: str, pattern: str, replacement: str) -> None:
    file_path = Path(path)
    source = file_path.read_text()
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"Expected one regex match in {path}, found {count}: {pattern}")
    file_path.write_text(updated)


Path("lib/event-visibility-client.ts").write_text(
    'export const EVENT_VISIBILITY_CHANGED_EVENT =\n'
    '  "leighpogo:event-visibility-changed";\n'
    'export const EVENT_VISIBILITY_POLL_INTERVAL_MS = 60_000;\n\n'
    'export function notifyEventVisibilityChanged(): void {\n'
    '  if (typeof window !== "undefined") {\n'
    '    window.dispatchEvent(new Event(EVENT_VISIBILITY_CHANGED_EVENT));\n'
    '  }\n'
    '}\n'
)

server_tail = indent(
    dedent(
        """
        return events.flatMap((event) => {
          const override = overrideByEventID.get(event.eventID);
          const typeRule = ruleByEventType.get(normaliseEventType(event.eventType));
          const eventIsHidden =
            (override && hideTimeReached(override.hidden, override.hideAt, now)) ||
            (typeRule && hideTimeReached(typeRule.hidden, typeRule.hideAt, now));

          if (eventIsHidden) {
            return [];
          }

          if (!override) {
            return [event];
          }

          return [
            {
              ...event,
              name: override.name,
              heading: override.heading,
              description: override.description,
              campfireUrl: override.campfireUrl,
              image: override.image,
              tags: override.tags,
              link: override.campfireUrl || event.link,
            },
          ];
        });
        """
    ).strip("\n"),
    "  ",
) + "\n}"
replace_regex_once(
    "lib/event-overrides.ts",
    r'  return events\.flatMap\(\(event\) => \{\n.*?\n  \}\);\n\}',
    server_tail,
)

def ticker_effect(loader_name: str, url: str, payload_type: str, item_type: str, error_text: str) -> str:
    return indent(
        dedent(
            f"""
            useEffect(() => {{
              let controller: AbortController | null = null;

              async function {loader_name}() {{
                controller?.abort();
                controller = new AbortController();

                try {{
                  const response = await fetch("{url}", {{
                    signal: controller.signal,
                    cache: "no-store",
                    headers: {{ Accept: "application/json" }},
                  }});

                  if (!response.ok) {{
                    setStatus("error");
                    return;
                  }}

                  const payload = (await response.json()) as {payload_type};
                  setItems(Array.isArray(payload.items) ? payload.items : []);
                  setStatus("ready");
                }} catch (error) {{
                  if ((error as Error).name !== "AbortError") {{
                    console.error("{error_text}", error);
                    setStatus("error");
                  }}
                }}
              }}

              const reload = () => {{
                void {loader_name}();
              }};
              const handleVisibilityChange = () => {{
                if (document.visibilityState === "visible") {{
                  reload();
                }}
              }};

              reload();
              const pollTimer = window.setInterval(
                reload,
                EVENT_VISIBILITY_POLL_INTERVAL_MS,
              );
              window.addEventListener(EVENT_VISIBILITY_CHANGED_EVENT, reload);
              window.addEventListener("focus", reload);
              document.addEventListener("visibilitychange", handleVisibilityChange);

              return () => {{
                controller?.abort();
                window.clearInterval(pollTimer);
                window.removeEventListener(EVENT_VISIBILITY_CHANGED_EVENT, reload);
                window.removeEventListener("focus", reload);
                document.removeEventListener("visibilitychange", handleVisibilityChange);
              }};
            }}, []);
            """
        ).strip("\n"),
        "  ",
    )

replace_once(
    "components/events/EventTicker.tsx",
    'import type { EventTickerItem } from "../../lib/events";',
    'import type { EventTickerItem } from "../../lib/events";\n'
    'import {\n'
    '  EVENT_VISIBILITY_CHANGED_EVENT,\n'
    '  EVENT_VISIBILITY_POLL_INTERVAL_MS,\n'
    '} from "../../lib/event-visibility-client";',
)
replace_regex_once(
    "components/events/EventTicker.tsx",
    r'  useEffect\(\(\) => \{\n.*?\n  \}, \[\]\);',
    ticker_effect(
        "loadTicker",
        "/api/events/ticker",
        "TickerPayload",
        "EventTickerItem",
        "Failed to load event ticker",
    ),
)

replace_once(
    "components/events/RaidBossTicker.tsx",
    'import type { RaidBossTickerItem } from "../../lib/events";',
    'import type { RaidBossTickerItem } from "../../lib/events";\n'
    'import {\n'
    '  EVENT_VISIBILITY_CHANGED_EVENT,\n'
    '  EVENT_VISIBILITY_POLL_INTERVAL_MS,\n'
    '} from "../../lib/event-visibility-client";',
)
replace_regex_once(
    "components/events/RaidBossTicker.tsx",
    r'  useEffect\(\(\) => \{\n.*?\n  \}, \[\]\);',
    ticker_effect(
        "loadRaidBosses",
        "/api/events/raids",
        "RaidTickerPayload",
        "RaidBossTickerItem",
        "Failed to load current raid bosses",
    ),
)

replace_once(
    "pages/admin/events.tsx",
    'import type { PokemonGoEventSummary } from "../../lib/events";',
    'import type { PokemonGoEventSummary } from "../../lib/events";\n'
    'import { notifyEventVisibilityChanged } from "../../lib/event-visibility-client";',
)
replace_regex_once(
    "pages/admin/events.tsx",
    r'(\n\s+setMessage\(payload\.message\);\n)(\s+cancelEdit\(\);)',
    r'\1      notifyEventVisibilityChanged();\n\2',
)
replace_regex_once(
    "pages/admin/events.tsx",
    r'(\n\s+setMessage\(payload\.message\);\n)(\n\s+if \(editingEventID === eventID\) \{)',
    r'\1    notifyEventVisibilityChanged();\n\2',
)
replace_once(
    "pages/admin/events.tsx",
    "Hide this event immediately",
    "Hide this event immediately everywhere",
)

replace_once(
    "pages/admin/event-types.tsx",
    'import type { PokemonGoEventSummary } from "../../lib/events";',
    'import type { PokemonGoEventSummary } from "../../lib/events";\n'
    'import { notifyEventVisibilityChanged } from "../../lib/event-visibility-client";',
)
replace_regex_once(
    "pages/admin/event-types.tsx",
    r'(function handleSaved\(rule: EventTypeRule, nextMessage: string\) \{.*?setError\(null\);)(\n  \})',
    r'\1\n    notifyEventVisibilityChanged();\2',
)
replace_regex_once(
    "pages/admin/event-types.tsx",
    r'(function handleReset\(eventType: string, nextMessage: string\) \{.*?setError\(null\);)(\n  \})',
    r'\1\n    notifyEventVisibilityChanged();\2',
)
replace_regex_once(
    "pages/admin/event-types.tsx",
    r'Filter the imported feed by event type and hide whole categories such\n\s+as Hatch Days\. Individual event overrides remain exceptions, so a\n\s+specific event redirected to Campfire can stay visible\.',
    'Filter the imported feed by event type and hide whole categories such\n'
    '            as Hatch Days. A hidden type is removed everywhere, including the events\n'
    '            page and both ticker bars, even when an individual event has an override.',
)

replace_once(
    "pages/admin/content.tsx",
    'import { getAllGuides, type GuideSummary } from "../../lib/guides";',
    'import { getAllGuides, type GuideSummary } from "../../lib/guides";\n'
    'import { notifyEventVisibilityChanged } from "../../lib/event-visibility-client";',
)
replace_regex_once(
    "pages/admin/content.tsx",
    r'(\n\s+setMessage\(payload\.message\);)(\n\s+\} catch \(caught\) \{)',
    r'\1\n      notifyEventVisibilityChanged();\2',
)
replace_regex_once(
    "pages/admin/content.tsx",
    r'(setEvents\(\(current\) => current\.filter\(\(event\) => event\.id !== id\)\);\n\s+setMessage\(payload\.message\);)',
    r'\1\n    notifyEventVisibilityChanged();',
)
