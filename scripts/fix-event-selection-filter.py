from pathlib import Path

path = Path("pages/events/index.tsx")
content = path.read_text()

old_effect = '''  useEffect(() => {
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
'''

new_effect = '''  useEffect(() => {
    if (selectedEventID) {
      setSelectedType("all");
    }
  }, [selectedEventID]);

  useEffect(() => {
    if (!selectedEventID || selectedType !== "all") {
      return;
    }

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
  }, [selectedEventID, selectedType]);
'''

if old_effect in content:
    content = content.replace(old_effect, new_effect, 1)
elif new_effect not in content:
    raise SystemExit("Event selection effect was not found")

old_filter = '''              onChange={(event) => setSelectedType(event.target.value)}
'''
new_filter = '''              onChange={(event) => {
                setSelectedType(event.target.value);

                if (selectedEventID) {
                  void router.replace("/events", undefined, {
                    shallow: true,
                    scroll: false,
                  });
                }
              }}
'''

if old_filter in content:
    content = content.replace(old_filter, new_filter, 1)
elif new_filter not in content:
    raise SystemExit("Event filter handler was not found")

path.write_text(content)
