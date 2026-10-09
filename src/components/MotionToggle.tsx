"use client";

import { useSyncExternalStore } from "react";
import { getReducedServerSnapshot, getReducedSnapshot, setMotionChoice, subscribeNoop } from "@/lib/motion";

const getTrue = () => true;
const getFalse = () => false;

export default function MotionToggle({ className = "" }: { className?: string }) {
  const reduced = useSyncExternalStore(subscribeNoop, getReducedSnapshot, getReducedServerSnapshot);
  const hydrated = useSyncExternalStore(subscribeNoop, getTrue, getFalse);
  return (
    <button
      type="button"
      className={`motion-toggle ${className}`}
      data-full={reduced ? undefined : ""}
      disabled={!hydrated}
      onClick={() => setMotionChoice(!reduced)}
    >
      <span className="motion-toggle__dot" aria-hidden="true" />
      {reduced ? "Turn on full motion" : "Reduce motion"}
    </button>
  );
}
