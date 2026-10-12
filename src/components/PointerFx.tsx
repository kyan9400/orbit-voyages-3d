"use client";

/*
  Desktop pointer polish (custom cursor + magnetic buttons), loaded like the 3D:
  nothing on the server, nothing during hydration. After window "load" and an
  idle moment, the small pointer module is imported — only for a fine pointer
  that can hover, and only with full motion.
*/
import { useEffect } from "react";
import { readReducedMotion } from "@/lib/motion";

type IdleWindow = Window & {
  requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

export default function PointerFx() {
  useEffect(() => {
    const w = window as IdleWindow;
    let cancelled = false;
    let stop: (() => void) | null = null;
    let idle = 0;
    let timer = 0;

    const start = () => {
      if (cancelled) return;
      if (!window.matchMedia("(pointer: fine) and (hover: hover)").matches || readReducedMotion()) return;
      void import("@/lib/pointer").then((m) => {
        if (!cancelled) stop = m.startPointer();
      });
    };
    const afterLoad = () => {
      if (w.requestIdleCallback) idle = w.requestIdleCallback(start, { timeout: 2500 });
      else timer = window.setTimeout(start, 1200);
    };
    if (document.readyState === "complete") afterLoad();
    else window.addEventListener("load", afterLoad, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", afterLoad);
      if (idle) w.cancelIdleCallback?.(idle);
      window.clearTimeout(timer);
      stop?.();
    };
  }, []);

  return null;
}
