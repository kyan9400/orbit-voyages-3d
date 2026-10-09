/*
  Motion preference.
  We follow the operating system's "reduce motion" setting by default, but many
  people switch animations off for speed rather than comfort, so the visitor can
  turn full motion back on. The choice is remembered; ?motion=full|reduced wins.
*/

const KEY = "orbit-motion";
type Choice = "full" | "reduced" | null;

function readChoice(): Choice {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("motion");
    if (fromUrl === "full" || fromUrl === "reduced") return fromUrl;
    const saved = window.localStorage.getItem(KEY);
    return saved === "full" || saved === "reduced" ? saved : null;
  } catch {
    return null;
  }
}

export function systemPrefersReduced(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** true = reduced motion. Client only. */
export function readReducedMotion(): boolean {
  const choice = readChoice();
  if (choice === "full") return false;
  if (choice === "reduced") return true;
  return systemPrefersReduced();
}

/** Save the choice and reload so every system starts in the right mode. */
export function setMotionChoice(reduced: boolean) {
  const value = reduced ? "reduced" : "full";
  const url = new URL(window.location.href);
  let saved = false;
  try {
    window.localStorage.setItem(KEY, value);
    saved = true;
  } catch {
    saved = false;
  }
  if (saved) url.searchParams.delete("motion");
  else url.searchParams.set("motion", value);
  try {
    window.history.replaceState(null, "", url);
    window.location.reload();
  } catch {
    window.location.href = url.href;
  }
}

/* useSyncExternalStore helpers: the value never changes without a reload */
export const subscribeNoop = () => () => {};
export const getReducedSnapshot = () => readReducedMotion();
export const getReducedServerSnapshot = () => true;
