/*
  Flight state shared by the DOM (scroll, HUD) and the 3D scene.
  A plain mutable object, not React state: it changes on every scroll event
  and the scene reads it inside useFrame.

  `target` is the shot position the page is scrolled to: 0 = hero (Earth) ... 5 = fares (Mars orbit).
  Shot i is reached when section i reaches the top of the viewport.
*/

export const SHOT_COUNT = 6;

type Listener = () => void;

export const flight = {
  target: 0,
  /** set by the scene: request a new frame */
  invalidate: null as Listener | null,
};

/** Telemetry for the HUD at a given shot position (fictional mission profile). */
const DAYS = [0, 3, 5, 104, 210, 214];
const DIST_MKM = [0, 0.38, 1.2, 112, 225, 225.4];

export function telemetry(p: number) {
  const i = Math.min(SHOT_COUNT - 2, Math.max(0, Math.floor(p)));
  const f = Math.min(1, Math.max(0, p - i));
  const day = DAYS[i] + (DAYS[i + 1] - DAYS[i]) * f;
  const dist = DIST_MKM[i] + (DIST_MKM[i + 1] - DIST_MKM[i]) * f;
  return { day, dist };
}
