"use client";

/*
  The fixed layer behind the page: a code-made poster (always there, and the
  fallback without WebGL), the lazily loaded 3D canvas on top of it, and a
  readability scrim. The 3D chunk is requested only once the browser is idle
  after load, so it never competes with the first paint.
*/
import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { getReducedServerSnapshot, getReducedSnapshot, subscribeNoop } from "@/lib/motion";

const FlightCanvas = dynamic(() => import("@/three/FlightCanvas"), { ssr: false, loading: () => null });

type IdleWindow = Window & {
  requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

let idle = false;
function subscribeIdle(cb: () => void) {
  if (idle) return () => {};
  const w = window as IdleWindow;
  let timer = 0;
  let idleId = 0;
  const go = () => {
    idle = true;
    cb();
  };
  const schedule = () => {
    if (w.requestIdleCallback) idleId = w.requestIdleCallback(go, { timeout: 2500 });
    else timer = window.setTimeout(go, 600);
  };
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
  return () => {
    window.removeEventListener("load", schedule);
    window.clearTimeout(timer);
    if (idleId && w.cancelIdleCallback) w.cancelIdleCallback(idleId);
  };
}

export default function Backdrop() {
  const reduced = useSyncExternalStore(subscribeNoop, getReducedSnapshot, getReducedServerSnapshot);
  const ready = useSyncExternalStore(subscribeIdle, () => idle, () => false);

  return (
    <div className="backdrop" aria-hidden="true">
      <div className="backdrop__poster" />
      <div className="backdrop__canvas">{ready && <FlightCanvas reduced={reduced} />}</div>
      <div className="backdrop__scrim" />
      <p className="backdrop__status">Plotting trajectory…</p>
    </div>
  );
}
