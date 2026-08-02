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
const DRAG_THRESHOLD_PX = 5;

export function useScrollableTicker({
  durationSeconds,
  contentKey,
  enabled = true,
}: ScrollableTickerOptions) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const copyWidthRef = useRef(0);
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

  const normaliseScrollPosition = useCallback(() => {
    const viewport = viewportRef.current;
    const copyWidth = copyWidthRef.current;

    if (!viewport || copyWidth <= viewport.clientWidth) {
      return;
    }

    if (viewport.scrollLeft <= 0) {
      viewport.scrollLeft += copyWidth;
    } else if (viewport.scrollLeft >= copyWidth * 2) {
      viewport.scrollLeft -= copyWidth;
    }
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktopFinePointer = window.matchMedia(
      "(hover: hover) and (pointer: fine)",
    );

    const updateMotionPreference = () => {
      autoScrollAllowedRef.current = !(
        reducedMotion.matches && !desktopFinePointer.matches
      );
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
      return;
    }

    let initialised = false;
    let frameId = 0;
    const measure = () => {
      const track = viewport.firstElementChild as HTMLElement | null;
      const firstCopy = track?.firstElementChild as HTMLElement | null;
      const copyWidth = firstCopy?.getBoundingClientRect().width ?? 0;

      copyWidthRef.current = copyWidth;

      if (copyWidth > viewport.clientWidth) {
        if (!initialised || viewport.scrollLeft <= 0) {
viewport.scrollLeft = copyWidth;
        }
      } else {
        viewport.scrollLeft = 0;
      }

      initialised = true;
    };

    frameId = window.requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);

    const track = viewport.firstElementChild as HTMLElement | null;
    const firstCopy = track?.firstElementChild as HTMLElement | null;
    if (firstCopy) {
      observer.observe(firstCopy);
    }

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [contentKey, enabled]);

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
        copyWidth > viewport.clientWidth &&
        !pausedRef.current &&
        autoScrollAllowedRef.current
      ) {
        const seconds = Math.max(durationSecondsRef.current, 1);
        viewport.scrollLeft += (copyWidth / seconds) * elapsedSeconds;
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
    if (
      !viewport ||
      copyWidthRef.current <= viewport.clientWidth
    ) {
      return;
    }

    pauseTicker();
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
    window.requestAnimationFrame(normaliseScrollPosition);
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
