/*
  Motion preference.
  The site starts in full motion on every first visit. The visitor can switch to
  reduced motion with the toggle; that choice is remembered (localStorage) and
  respected on later visits. ?motion=full|reduced wins over both.
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

/** true = reduced motion. Client only. */
export function readReducedMotion(): boolean {
  const choice = readChoice();
  return choice === "reduced";
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
