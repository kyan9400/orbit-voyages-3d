/*
  Quality tier, decided BEFORE the 3D chunk is even requested.
  A throwaway WebGL2 context (no three.js needed) tells us whether 3D works at
  all, whether it would run on a software rasteriser, and which GPU this is.
*/

export type Tier = "high" | "medium" | "low";

export type QualitySettings = {
  tier: Tier;
  dprCap: number;
  antialias: boolean;
  bake: number; // width of the planet maps (height = width / 2)
  marsBake: number;
  stars: number;
  streaks: number;
  envMap: boolean; // RoomEnvironment PMREM reflections on the cruiser
  shipDetail: 0 | 1 | 2; // 0 = standard materials, 1 = physical + clearcoat, 2 = + anisotropy, iridescence, glow quads
  plume: boolean; // exhaust plume during the burn (two draws)
};

/** What the page should do with the 3D layer. */
export type QualityDecision =
  | { mode: "3d"; q: QualitySettings }
  | { mode: "none"; reason: "no-webgl" | "software" };

const TIERS: Record<Tier, Omit<QualitySettings, "tier">> = {
  high: { dprCap: 2, antialias: true, bake: 2048, marsBake: 2048, stars: 7000, streaks: 1400, envMap: true, shipDetail: 2, plume: true },
  medium: { dprCap: 1.5, antialias: true, bake: 1024, marsBake: 1024, stars: 4000, streaks: 800, envMap: true, shipDetail: 1, plume: true },
  low: { dprCap: 1, antialias: false, bake: 1024, marsBake: 512, stars: 2000, streaks: 350, envMap: false, shipDetail: 0, plume: true },
};

const ORDER: Tier[] = ["low", "medium", "high"];
const atMost = (a: Tier, b: Tier): Tier => (ORDER.indexOf(a) < ORDER.indexOf(b) ? a : b);

/** Software rasterisers: a CPU-throttled phone in a lab, a VM, a remote desktop. */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen|gdi generic/i;

function gpuName(gl: WebGL2RenderingContext): string {
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const unmasked = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || "") : "";
  return unmasked || String(gl.getParameter(gl.RENDERER) || "");
}

function context(opts: WebGLContextAttributes): WebGL2RenderingContext | null {
  try {
    return document.createElement("canvas").getContext("webgl2", opts);
  } catch {
    return null;
  }
}

function lose(gl: WebGL2RenderingContext) {
  gl.getExtension("WEBGL_lose_context")?.loseContext();
}

/** Tiny GPU probe: one 300×150 context, read the renderer string, drop the context. */
function probe(): { gpu: string; software: boolean } | null {
  let gl = context({ powerPreference: "high-performance", failIfMajorPerformanceCaveat: true });
  let caveat = false;
  if (!gl) {
    // the browser would only give us a slow (software) context
    gl = context({ powerPreference: "high-performance" });
    if (!gl) return null;
    caveat = true;
  }
  const gpu = gpuName(gl);
  lose(gl);
  return { gpu, software: caveat || SOFTWARE.test(gpu) };
}

function readForced(): Tier | null {
  const forced = new URLSearchParams(window.location.search).get("quality");
  return forced === "high" || forced === "medium" || forced === "low" ? forced : null;
}

/** Client only. ?quality=low|medium|high forces the 3D on (when WebGL2 exists at all). */
export function decideQuality(): QualityDecision {
  const gpu = probe();
  if (!gpu) return { mode: "none", reason: "no-webgl" };

  const forced = readForced();
  if (forced) return { mode: "3d", q: { tier: forced, ...TIERS[forced] } };
  if (gpu.software) return { mode: "none", reason: "software" };

  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const cores = nav.hardwareConcurrency || 4;
  const memory = nav.deviceMemory || 4;
  let tier: Tier = "high";
  if (nav.connection?.saveData || cores <= 2 || memory <= 2) tier = "low";
  if (/intel|uhd|iris|mali|adreno|powervr|apple gpu|radeon\(tm\) graphics|radeon graphics|vega/i.test(gpu.gpu))
    tier = atMost(tier, "medium");
  if (window.matchMedia("(pointer: coarse)").matches) tier = atMost(tier, "medium");
  return { mode: "3d", q: { tier, ...TIERS[tier] } };
}
