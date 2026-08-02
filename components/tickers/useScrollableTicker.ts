import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";

interface ScrollableTickerOptions {
  durationSeconds: number;
  contentKey: string | number;
  enabled?: boolean;
}

const AUTO_RESUME_DELAY_MS = 3000;
const LAYOUT_RETRY_INTERVAL_MS = 500;
const DRAG_THRESHOLD_PX = 5;

export function useScrollableTicker({
  durationSeconds,
  contentKey,
  enabled = true,
}: ScrollableTickerOptions) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const copyWidthRef = useRef(0);
  const copyCountRef = useRef(0);
  const scrollableRef = useRef(false);
  const virtualScrollLeftRef = useRef(0);
  const durationSecondsRef = useRef(durationSeconds);
  const pausedRef = useRef(false);
  const autoScrollAllowedRef = useRef(true);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    dragged: boolean;
  } | null>(null);
  const [paused, setPausedState] = useState(false);
  const [dragging, setDragging] = useState(false);

  durationSecondsRef.current = durationSeconds;

  const clearResumeTimer = useCallback(() => {
    if (resumeTimerRef.current !== null) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }, []);

  const setPaused = useCallback((nextPaused: boolean) => {
    pausedRef.current = nextPaused;
    setPausedState(nextPaused);
  }, []);

  const pauseTicker = useCallback(() => {
    clearResumeTimer();
    setPaused(true);
  }, [clearResumeTimer, setPaused]);

  const scheduleResume = useCallback(() => {
    clearResumeTimer();
    resumeTimerRef.current = setTimeout(() => {
      resumeTimerRef.current = null;
      setPaused(false);
    }, AUTO_RESUME_DELAY_MS);
  }, [clearResumeTimer, setPaused]);

  const measureTicker = useCallback((resetPosition = false) => {
    const viewport = viewportRef.current;
    const track = viewport?.firstElementChild as HTMLElement | null;
    const firstCopy = track?.firstElementChild as HTMLElement | null;

    if (!viewport || !track || !firstCopy) {
      copyWidthRef.current = 0;
      copyCountRef.current = 0;
      scrollableRef.current = false;
      return false;
    }

    const copyWidth = Math.max(
      firstCopy.getBoundingClientRect().width,
      firstCopy.scrollWidth,
    );
    const copyCount = track.childElementCount;
    const maxScrollLeft = Math.max(
      0,
      track.scrollWidth - viewport.clientWidth,
    );
    const scrollable = copyWidth > 0.5 && maxScrollLeft > 0.5;

    copyWidthRef.current = copyWidth;
    copyCountRef.current = copyCount;
    scrollableRef.current = scrollable;

    if (!scrollable) {
      virtualScrollLeftRef.current = 0;
      viewport.scrollLeft = 0;
      return false;
    }

    if (resetPosition || viewport.scrollLeft <= 0.5) {
    const preferredPosition = copyWidth * Math.floor(copyCount / 2);
    const minimumSafePosition = Math.min(copyWidth, maxScrollLeft);
    const maximumSafePosition = Math.max(
      minimumSafePosition,
      maxScrollLeft - copyWidth,
    );
    const nextScrollLeft = Math.min(
      Math.max(preferredPosition, minimumSafePosition),
      maximumSafePosition,
    );

    virtualScrollLeftRef.current = nextScrollLeft;
    viewport.scrollLeft = nextScrollLeft;
  } else if (
    Math.abs(viewport.scrollLeft - virtualScrollLeftRef.current) > 1
  ) {
    virtualScrollLeftRef.current = viewport.scrollLeft;
  }

  return true;
  }, []);

  const normaliseScrollPosition = useCallback(() => {
  const viewport = viewportRef.current;
  const track = viewport?.firstElementChild as HTMLElement | null;
  const copyWidth = copyWidthRef.current;
  const copyCount = copyCountRef.current;

  if (!viewport || !track || copyWidth <= 0 || copyCount < 3) {
    return;
  }

  const maxScrollLeft = Math.max(
    0,
    track.scrollWidth - viewport.clientWidth,
  );
  if (maxScrollLeft <= 0) {
    return;
  }

  const edgeBuffer = Math.min(copyWidth / 2, maxScrollLeft / 4);
  let nextScrollLeft = virtualScrollLeftRef.current;

  if (
    nextScrollLeft <= edgeBuffer &&
    nextScrollLeft + copyWidth <= maxScrollLeft
  ) {
    nextScrollLeft += copyWidth;
  } else if (
    nextScrollLeft >= maxScrollLeft - edgeBuffer &&
    nextScrollLeft - copyWidth >= 0
  ) {
    nextScrollLeft -= copyWidth;
  }

  if (nextScrollLeft !== virtualScrollLeftRef.current) {
    virtualScrollLeftRef.current = nextScrollLeft;
    viewport.scrollLeft = nextScrollLeft;
  }
}, []);

useEffect(() => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktopFinePointer = window.matchMedia(
      "(any-hover: hover) and (any-pointer: fine)",
    );

    const updateMotionPreference = () => {
      autoScrollAllowedRef.current =
        !reducedMotion.matches || desktopFinePointer.matches;
    };

    updateMotionPreference();
    reducedMotion.addEventListener("change", updateMotionPreference);
    desktopFinePointer.addEventListener("change", updateMotionPreference);

    return () => {
      reducedMotion.removeEventListener("change", updateMotionPreference);
      desktopFinePointer.removeEventListener("change", updateMotionPreference);
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport || !enabled) {
      copyWidthRef.current = 0;
      copyCountRef.current = 0;
      scrollableRef.current = false;
      return;
    }

    let cancelled = false;
    const measure = () => {
      if (!cancelled) {
        measureTicker(false);
      }
    };

    const initialFrameId = window.requestAnimationFrame(() => {
      if (!cancelled) {
        measureTicker(true);
      }
    });
    const retryTimer = window.setInterval(
      measure,
      LAYOUT_RETRY_INTERVAL_MS,
    );
    const observer = new ResizeObserver(measure);
    const track = viewport.firstElementChild as HTMLElement | null;
    const firstCopy = track?.firstElementChild as HTMLElement | null;

    observer.observe(viewport);
    if (track) {
      observer.observe(track);
    }
    if (firstCopy) {
      observer.observe(firstCopy);
    }

    window.addEventListener("load", measure);
    void document.fonts?.ready.then(measure);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(initialFrameId);
      window.clearInterval(retryTimer);
      window.removeEventListener("load", measure);
      observer.disconnect();
    };
  }, [contentKey, enabled, measureTicker]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let frameId = 0;
    let previousTime = performance.now();

    const animate = (time: number) => {
      const viewport = viewportRef.current;
      const copyWidth = copyWidthRef.current;
      const elapsedSeconds = Math.min(time - previousTime, 100) / 1000;
      previousTime = time;

      if (
        viewport &&
        scrollableRef.current &&
        !pausedRef.current &&
        autoScrollAllowedRef.current
      ) {
        const seconds = Math.max(durationSecondsRef.current, 1);
        virtualScrollLeftRef.current +=
          (copyWidth / seconds) * elapsedSeconds;
        viewport.scrollLeft = virtualScrollLeftRef.current;
        normaliseScrollPosition();
      }

      frameId = window.requestAnimationFrame(animate);
    };

    frameId = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frameId);
  }, [enabled, normaliseScrollPosition]);

  useEffect(
    () => () => {
      clearResumeTimer();
    },
    [clearResumeTimer],
  );

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    const viewport = viewportRef.current;
    if (!viewport || !scrollableRef.current) {
      return;
    }

    pauseTicker();
    virtualScrollLeftRef.current = viewport.scrollLeft;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: viewport.scrollLeft,
      dragged: false,
    };
    viewport.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    const drag = dragRef.current;

    if (!viewport || !drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - drag.startX;
    if (!drag.dragged && Math.abs(deltaX) < DRAG_THRESHOLD_PX) {
      return;
    }

    drag.dragged = true;
    setDragging(true);
    event.preventDefault();

    const copyWidth = copyWidthRef.current;
    let nextScrollLeft = drag.startScrollLeft - deltaX;

    while (nextScrollLeft < 0) {
      nextScrollLeft += copyWidth;
    }
    while (nextScrollLeft >= copyWidth * 2) {
      nextScrollLeft -= copyWidth;
    }

    virtualScrollLeftRef.current = nextScrollLeft;
    viewport.scrollLeft = nextScrollLeft;
  }

  function finishPointerInteraction(event: PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    if (viewport?.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }

    if (drag.dragged) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }

    dragRef.current = null;
    setDragging(false);
    normaliseScrollPosition();
    scheduleResume();
  }

  function handleClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!suppressClickRef.current) {
      return;
    }

    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  function handleFocus(event: FocusEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).matches(":focus-visible")) {
      pauseTicker();
    }
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget as Node | null;
    if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
      scheduleResume();
    }
  }

  function handleWheel(_event: WheelEvent<HTMLDivElement>) {
  pauseTicker();
  window.requestAnimationFrame(() => {
    const viewport = viewportRef.current;
    if (viewport) {
      virtualScrollLeftRef.current = viewport.scrollLeft;
    }
    normaliseScrollPosition();
  });
  scheduleResume();
}

  return {
    viewportRef,
    paused,
    dragging,
    viewportHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: finishPointerInteraction,
      onPointerCancel: finishPointerInteraction,
      onClickCapture: handleClickCapture,
      onFocusCapture: handleFocus,
      onBlurCapture: handleBlur,
      onWheel: handleWheel,
    },
  };
}
