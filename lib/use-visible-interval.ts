"use client";

import { useEffect, useRef } from "react";

/**
 * setInterval that only fires while the tab is in front, and catches up the
 * moment it returns.
 *
 * A plain interval polling a remote API has no natural end: a tab left open
 * behind other work goes on requesting forever, spending rate limit on a
 * screen nobody is looking at. Instagram's Conversations API is slow and
 * tightly rate-limited, so the inbox was the worst offender — two intervals,
 * every twelve seconds, indefinitely.
 *
 * Returning to the tab fires immediately rather than waiting out the
 * remaining delay, so a backgrounded inbox is never staler than the moment
 * it is looked at.
 *
 * The callback is held in a ref so a caller does not have to memoise it to
 * avoid tearing down the interval on every render.
 */
export function useVisibleInterval(
  callback: () => void,
  delayMs: number | null
) {
  const saved = useRef(callback);

  // Updated in an effect rather than during render: a ref write during render
  // is not safe under concurrent rendering, and the compiler's lint rule is
  // right to reject it.
  useEffect(() => {
    saved.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delayMs === null) return;

    const tick = () => {
      if (!document.hidden) saved.current();
    };

    const timer = window.setInterval(tick, delayMs);
    // Refresh on return rather than making the visitor wait out the interval.
    document.addEventListener("visibilitychange", tick);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [delayMs]);
}
