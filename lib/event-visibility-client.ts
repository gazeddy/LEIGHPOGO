export const EVENT_VISIBILITY_CHANGED_EVENT =
  "leighpogo:event-visibility-changed";
export const EVENT_VISIBILITY_POLL_INTERVAL_MS = 60_000;

export function notifyEventVisibilityChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENT_VISIBILITY_CHANGED_EVENT));
  }
}
