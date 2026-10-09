/*
  Quality tier, decided BEFORE the Canvas is created.
  A throwaway WebGL2 context tells us whether 3D works at all and which GPU this is.
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
};

const TIERS: Record<Tier, Omit<QualitySettings, "tier">> = {
  high: { dprCap: 2, antialias: true, bake: 2048, marsBake: 2048, stars: 7000, streaks: 1400 },
  medium: { dprCap: 1.5, antialias: true, bake: 1024, marsBake: 1024, stars: 4000, streaks: 800 },
  low: { dprCap: 1, antialias: false, bake: 1024, marsBake: 512, stars: 2000, streaks: 350 },
};

const ORDER: Tier[] = ["low", "medium", "high"];
const atMost = (a: Tier, b: Tier): Tier => (ORDER.indexOf(a) < ORDER.indexOf(b) ? a : b);

function gpuName(gl: WebGL2RenderingContext): string {
  const name = String(gl.getParameter(gl.RENDERER) || "");
  if (!/^webkit/i.test(name)) return name;
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || name) : name;
}

/** Returns null when WebGL2 is not available. Client only. */
export function detectQuality(): QualitySettings | null {
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = document.createElement("canvas").getContext("webgl2", { powerPreference: "high-performance" });
  } catch {
    gl = null;
  }
  if (!gl) return null;
  const gpu = gpuName(gl);
  gl.getExtension("WEBGL_lose_context")?.loseContext();

  const forced = new URLSearchParams(window.location.search).get("quality");
  let tier: Tier = "high";
  if (forced === "high" || forced === "medium" || forced === "low") {
    tier = forced;
  } else {
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    const cores = nav.hardwareConcurrency || 4;
    const memory = nav.deviceMemory || 4;
    if (/swiftshader|llvmpipe|software|basic render/i.test(gpu)) tier = "low";
    else if (nav.connection?.saveData || cores <= 2 || memory <= 2) tier = "low";
    if (/intel|uhd|iris|mali|adreno|powervr|apple gpu|radeon\(tm\) graphics|radeon graphics|vega/i.test(gpu))
      tier = atMost(tier, "medium");
    if (window.matchMedia("(pointer: coarse)").matches) tier = atMost(tier, "medium");
  }
  return { tier, ...TIERS[tier] };
}
