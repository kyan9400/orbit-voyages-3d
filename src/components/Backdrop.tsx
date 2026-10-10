"use client";

/*
  The fixed layer behind the page: a code-made poster (always there, and the
  fallback without WebGL), the lazily loaded 3D canvas on top of it, and a
  readability scrim.

  Nothing 3D happens during hydration. After window "load" we wait for an idle
  moment, run a tiny GPU probe (no three.js), and only then request the 3D chunk.
  Software renderers (SwiftShader, llvmpipe, …) never download it: the poster
  stays, the page stays fully usable. ?quality=low|medium|high forces it on.
*/
import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { getReducedServerSnapshot, getReducedSnapshot, subscribeNoop } from "@/lib/motion";
import { decideQuality, type QualitySettings } from "@/lib/quality";

const FlightCanvas = dynamic(() => import("@/three/FlightCanvas"), { ssr: false, loading: () => null });

type IdleWindow = Window & {
  requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/* module-level store: null until the idle probe has run */
let quality: QualitySettings | null = null;
let decided = false;
const listeners = new Set<() => void>();

function decide() {
  if (decided) return;
  decided = true;
  const result = decideQuality();
  if (result.mode === "3d") quality = result.q;
  // no 3D: hide the "plotting" status and keep the poster
  else document.documentElement.dataset.webgl = "off";
  listeners.forEach((l) => l());
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  const w = window as IdleWindow;
  const afterLoad = () => {
    if (w.requestIdleCallback) w.requestIdleCallback(decide, { timeout: 2500 });
    else window.setTimeout(decide, 1200);
  };
  if (document.readyState === "complete") afterLoad();
  else window.addEventListener("load", afterLoad, { once: true });
}

function subscribeQuality(cb: () => void) {
  listeners.add(cb);
  schedule();
  return () => {
    listeners.delete(cb);
  };
}
const getQuality = () => quality;
const getServerQuality = () => null;

export default function Backdrop() {
  const reduced = useSyncExternalStore(subscribeNoop, getReducedSnapshot, getReducedServerSnapshot);
  const q = useSyncExternalStore(subscribeQuality, getQuality, getServerQuality);

  return (
    <div className="backdrop" aria-hidden="true">
      <div className="backdrop__poster" />
      <div className="backdrop__canvas">{q && <FlightCanvas q={q} reduced={reduced} />}</div>
      <div className="backdrop__scrim" />
      <p className="backdrop__status">Plotting trajectory…</p>
    </div>
  );
}
