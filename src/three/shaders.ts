/*
  GLSL for Orbit Voyages.

  The planet surfaces are real NASA imagery (Blue Marble, Black Marble, LRO, Viking),
  packed offline into equirectangular WebP maps (see world.ts / CREDITS.md).
  The BAKE shader runs once at start-up and paints the nebula sky into a render target;
  the noise is evaluated on the 3D sphere direction, so the map has no seams.
  RENDER shaders run every frame and only read maps, which keeps the per-pixel cost
  low on integrated GPUs and phones.

  Colour maps are sRGB, which is close to sqrt(linear colour); render shaders square
  them back (cheap gamma-2 decode).
*/

/* ---------- shared noise (sky bake) ---------- */
const NOISE = /* glsl */ `
// value noise from a 64^3 random lattice in a 3D texture: one hardware-filtered fetch with
// quintic smoothing (offsetting the coordinate inside the cell). Far cheaper to compile than
// eight inlined hashes per call, which used to cost tens of seconds on D3D (ANGLE).
uniform highp sampler3D uNoise;
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return texture(uNoise, (i + f + 0.5) / 64.0).r;
}

float fbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 6; i++) {
    sum += amp * vnoise(p);
    p = p * 2.03 + vec3(17.1, 9.2, 4.7);
    amp *= 0.5;
  }
  return sum / 0.984;
}

// matches THREE.SphereGeometry's uv layout
vec3 dirFromUv(vec2 uv) {
  float phi = uv.x * 6.28318530718;
  float theta = (1.0 - uv.y) * 3.14159265359;
  return vec3(-cos(phi) * sin(theta), cos(theta), sin(phi) * sin(theta));
}
`;

export const bakeVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/* ---------- nebula sky ---------- */
export const skyBakeFrag = /* glsl */ `
varying vec2 vUv;
uniform vec3 uBand;
${NOISE}
void main() {
  vec3 d = dirFromUv(vUv);
  float b = dot(d, uBand);
  float band = exp(-b * b * 16.0);
  float cl = fbm(d * 3.0 + fbm(d * 2.0));
  float lanes = smoothstep(0.48, 0.70, fbm(d * 7.0 + 3.0));
  vec3 col = vec3(0.060, 0.066, 0.110) * band * (0.4 + cl) * (1.0 - lanes * 0.65 * band);
  // emission nebulae: a warm magenta cloud and a cool teal one, with brighter filaments inside
  vec3 nw = vec3(fbm(d * 2.2 + 70.0), fbm(d * 2.2 + 80.0), fbm(d * 2.2 + 85.0)) - 0.5;
  float neb1 = smoothstep(0.52, 0.80, fbm(d * 2.4 + nw * 1.4 + 50.0));
  float neb2 = smoothstep(0.50, 0.80, fbm(d * 2.0 + nw * 1.2 + 90.0));
  float fil = smoothstep(0.55, 0.75, fbm(d * 9.0 + nw * 3.0));
  col += vec3(0.170, 0.040, 0.090) * neb1 * (0.45 + fil * 0.8);
  col += vec3(0.025, 0.085, 0.130) * neb2 * (0.45 + fil * 0.7);
  col *= 1.0 - lanes * 0.4 * (neb1 + neb2);
  gl_FragColor = vec4(sqrt(col * 0.7), 1.0);
}
`;

/* ======================= render shaders ======================= */

const OUTPUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

export const planetVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vT;
varying vec3 vB;
varying vec3 vP;
void main() {
  vUv = uv;
  // tangent frame of the sphere's uv layout (+u = east, +v = north), in world space
  vec3 n = normalize(normal);
  vec3 t = vec3(n.z, 0.0, -n.x);
  float tl = length(t);
  t = tl > 0.001 ? t / tl : vec3(1.0, 0.0, 0.0);
  vec3 b = cross(n, t);
  b = b.y < 0.0 ? -b : b;
  vN = normalize(mat3(modelMatrix) * n);
  vT = normalize(mat3(modelMatrix) * t);
  vB = normalize(mat3(modelMatrix) * b);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const earthFrag = /* glsl */ `
uniform vec2 uMapSize;
// hash adapted from "Hash without Sine" by David Hoskins (MIT)
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
uniform sampler2D uSurface;
uniform sampler2D uData;
uniform vec3 uSun;
uniform float uCloud;
uniform float uLights; // intro: 0 = city lights off, 1 = all on
varying vec2 vUv;
varying vec3 vN;
varying vec3 vT;
varying vec3 vB;
varying vec3 vP;
void main() {
  vec3 Ng = normalize(vN);
  vec3 V = normalize(cameraPosition - vP);
  vec3 L = uSun;
  vec4 s = texture2D(uSurface, vUv);
  vec3 albedo = s.rgb * s.rgb;
  float ocean = s.a;
  float lightsMap = texture2D(uData, vUv).g;

  // Close up (low orbit), one Black Marble texel spans dozens of pixels. Split each texel into
  // 8 x 8 cells and light a share of them (more where the city is brighter) as soft points,
  // so cities read as clusters of lights rather than blurred squares. Fades out when the map is minified.
  vec2 cellUv = vUv * uMapSize * 8.0;
  vec2 fw = fwidth(vUv) * uMapSize;
  float texPx = 1.0 / max(min(fw.x, fw.y), 1e-5);   // screen pixels per texel (along the more magnified axis)
  float zoom = smoothstep(3.0, 10.0, texPx);
  if (zoom > 0.0) {
    float h = hash12(floor(cellUv));
    float dotShape = smoothstep(0.55, 0.05, length(fract(cellUv) - 0.5));
    float speck = step(1.0 - lightsMap * 0.85, h) * dotShape;
    lightsMap = mix(lightsMap, lightsMap * 0.1 + speck * 1.9 * sqrt(lightsMap), zoom);
  }
  float c = texture2D(uData, vUv + vec2(uCloud, 0.0)).r;
  float shadow = texture2D(uData, vUv + vec2(uCloud - 0.003, 0.002)).r;

  // the Blue Marble colour already carries shaded relief, so the geometric normal is used
  vec3 N = Ng;

  float ndl = dot(Ng, L);
  float lit = max(dot(N, L), 0.0) * smoothstep(-0.05, 0.08, ndl);
  float litG = max(ndl, 0.0);
  float day = smoothstep(-0.12, 0.22, ndl);
  float term = exp(-pow(ndl * 4.5, 2.0));
  vec3 sunCol = vec3(1.0, 0.96, 0.9);

  vec3 col = albedo * lit * 2.6 * sunCol * (1.0 - shadow * 0.45);

  // ocean glint, broken up by a coarse "wind" read from a low mip of the cloud field
  float wind = texture2D(uData, vec2(vUv.x * 3.0 + 0.37, vUv.y), 3.0).r;
  vec3 H = normalize(L + V);
  float nh = max(dot(Ng, H), 0.0);
  float glint = pow(nh, mix(150.0, 45.0, wind)) * mix(2.6, 1.3, wind) + pow(nh, 14.0) * 0.10;
  col += glint * ocean * litG * (1.0 - c) * sunCol;

  vec3 cloudCol = vec3(litG * 1.6 + 0.004) * mix(vec3(1.0), vec3(1.0, 0.55, 0.30), term * 0.85);
  col = mix(col, cloudCol, c * 0.96);

  // brighter cities switch on first during the intro
  float on = smoothstep(1.0 - uLights * 1.3, 1.3 - uLights * 1.3, lightsMap);
  col += vec3(1.0, 0.60, 0.26) * lightsMap * on * (1.0 - day) * (1.0 - c * 0.85) * 1.3;

  // moonlit night side: a faint cool fill so the dark hemisphere still reads as a sphere
  float night = 1.0 - day;
  col += (albedo * vec3(0.05, 0.07, 0.12) + c * vec3(0.010, 0.013, 0.022)) * night;

  float fres = pow(1.0 - max(dot(Ng, V), 0.0), 2.4);
  vec3 atm = mix(vec3(0.22, 0.48, 1.0), vec3(1.0, 0.48, 0.22), term * 0.6);
  col = mix(col, atm * smoothstep(-0.25, 0.45, ndl) * 1.1, fres * 0.65);
  col += vec3(0.020, 0.045, 0.110) * litG;

  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT}
}
`;

export const rockyFrag = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uSun;
uniform vec3 uAtm;
uniform float uAtmAmt;
uniform vec2 uTexel;
uniform float uBump;
uniform vec3 uEarth;
uniform float uEarthshine;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vT;
varying vec3 vB;
varying vec3 vP;
void main() {
  vec4 s = texture2D(uMap, vUv);
  vec3 albedo = s.rgb * s.rgb;

  // bump from the baked height (alpha): tangent frame of the sphere's uv layout
  float h0 = s.a;
  float hu = texture2D(uMap, vUv + vec2(uTexel.x, 0.0)).a;
  float hv = texture2D(uMap, vUv + vec2(0.0, uTexel.y)).a;
  vec3 Ng = normalize(vN);
  vec3 N = normalize(Ng - uBump * ((hu - h0) * normalize(vT) + (hv - h0) * normalize(vB)));

  vec3 V = normalize(cameraPosition - vP);
  vec3 L = uSun;
  float ndl = dot(N, L);
  float lit = max(ndl, 0.0);
  // slightly flattened falloff, like a dusty surface
  float diff = mix(lit, sqrt(lit), 0.25) * smoothstep(-0.05, 0.08, dot(Ng, L));
  vec3 col = albedo * diff * 2.1 * vec3(1.0, 0.95, 0.88) + albedo * 0.006;

  // earthshine: the night side is lit faintly by the Earth (Moon only)
  col += albedo * uEarthshine * max(dot(Ng, normalize(uEarth - vP)), 0.0);

  float ndlG = dot(Ng, L);
  float fres = pow(1.0 - max(dot(Ng, V), 0.0), 3.0);
  col += uAtm * fres * smoothstep(-0.2, 0.5, ndlG) * uAtmAmt;
  // dusty haze band along the terminator (Mars only: the Moon has no atmosphere colour)
  float term = exp(-pow(ndlG * 4.5, 2.0));
  col += uAtm * term * smoothstep(-0.15, 0.1, ndlG) * 0.25 * uAtmAmt;

  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT}
}
`;

export const atmosphereFrag = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uColor;
uniform vec3 uSunset;
uniform vec3 uCenter;
uniform float uRadius;
uniform float uShell;     // shell radius / planet radius
uniform float uIntensity;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vT;
varying vec3 vB;
varying vec3 vP;
void main() {
  // the view ray's closest approach to the planet centre gives the altitude it grazes
  vec3 dir = normalize(vP - cameraPosition);
  vec3 oc = uCenter - cameraPosition;
  float tc = max(dot(oc, dir), 0.0);
  vec3 pc = cameraPosition + dir * tc;
  float h = length(pc - uCenter) / uRadius;           // 1 = surface, uShell = top of the shell
  float alt = clamp((h - 1.0) / (uShell - 1.0), 0.0, 1.0);
  float dens = exp(-alt * 6.0) * smoothstep(1.0, 0.85, alt);

  vec3 n = normalize(pc - uCenter);
  float mu = dot(n, uSun);
  float sunSide = smoothstep(-0.28, 0.35, mu);
  float twilight = exp(-pow(mu * 3.2, 2.0));           // the terminator band
  float mie = pow(max(dot(dir, uSun), 0.0), 10.0);      // forward scattering toward the sun
  float mieWide = pow(max(dot(dir, uSun), 0.0), 3.0);

  // Rayleigh: deep blue high up, paler near the ground; sunset colours low along the terminator
  vec3 col = mix(uColor, mix(uColor, vec3(1.0), 0.55), exp(-alt * 7.0));
  col = mix(col, uSunset, twilight * exp(-alt * 3.5) * 0.85);
  float a = dens * (sunSide * 0.85 + twilight * 0.6 * mieWide + mie * 2.2 * (0.3 + twilight)) * uIntensity;
  gl_FragColor = vec4(col * a, 1.0);
  ${OUTPUT}
}
`;

export const billboardVertex = /* glsl */ `
uniform float uSize;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * uSize * length(modelMatrix[0].xyz); // follows the parent's scale
  gl_Position = projectionMatrix * mv;
}
`;

export const glowFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uCore;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  vec2 c = vUv - 0.5;
  float d = length(c) * 2.0;
  float core = smoothstep(uCore, uCore * 0.6, d);
  float halo = exp(-d * 5.5) * 0.9 + 0.025 / (d * d + 0.02) * 0.12;
  float rays = pow(max(1.0 - abs(c.y) * 40.0, 0.0), 2.0) * exp(-abs(c.x) * 5.0) * 0.35;
  float a = (core * 4.0 + halo + rays) * smoothstep(1.0, 0.7, d) * uIntensity;
  gl_FragColor = vec4(uColor * a, 1.0);
  ${OUTPUT}
}
`;

export const skyVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const skyFrag = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(uMap, vUv).rgb;
  gl_FragColor = vec4(s * s, 1.0);
  ${OUTPUT}
}
`;

export const starsVertex = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
uniform float uPR;
uniform float uTime;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.8 + 0.2 * sin(uTime * (0.6 + aSize * 0.7) + position.x * 0.13 + position.y * 0.07);
  gl_PointSize = aSize * uPR;
  vColor = aColor * tw;
}
`;

export const starsFrag = /* glsl */ `
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  gl_FragColor = vec4(vColor * a * a, 1.0);
  ${OUTPUT}
}
`;

export const streaksVertex = /* glsl */ `
attribute float aEnd;
attribute float aBright;
uniform vec3 uTrail;
varying float vA;
void main() {
  vec3 p = position + uTrail * aEnd * (0.6 + aBright);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  vA = aBright * smoothstep(45.0, 6.0, dist) * smoothstep(0.4, 2.0, dist) * mix(1.0, 0.25, aEnd);
}
`;

export const streaksFrag = /* glsl */ `
uniform float uOpacity;
varying float vA;
void main() {
  gl_FragColor = vec4(vec3(0.72, 0.84, 1.0) * vA * uOpacity, 1.0);
  ${OUTPUT}
}
`;

/* ---------- the cruiser's exhaust plume (additive, burn only) ---------- */
export const plumeVertex = /* glsl */ `
varying vec3 vN;
varying vec3 vP;
varying float vS;
void main() {
  vS = 1.0 - uv.y; // 0 at the nozzle, 1 at the far end
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const plumeFrag = /* glsl */ `
uniform float uBurn;
uniform float uTime;
uniform float uBands;
varying vec3 vN;
varying vec3 vP;
varying float vS;
void main() {
  vec3 V = normalize(cameraPosition - vP);
  float core = pow(abs(dot(normalize(vN), V)), 1.6);      // soft fresnel edge
  float len = pow(1.0 - vS, 1.8) * smoothstep(0.0, 0.04, vS);
  float diamonds = 0.5 + 0.5 * sin(vS * 28.0 - uTime * 40.0); // shock diamonds
  float bands = 1.0 + uBands * 0.6 * diamonds * (1.0 - vS);
  vec3 col = mix(vec3(0.85, 0.92, 1.0), vec3(0.25, 0.45, 1.0), smoothstep(0.0, 0.5, vS));
  float a = core * len * bands * uBurn * 0.9;
  gl_FragColor = vec4(col * a, 1.0);
  ${OUTPUT}
}
`;

/* ---------- soft window glow quads on the habitat ring (instanced) ---------- */
export const windowGlowVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

export const windowGlowFrag = /* glsl */ `
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 c = (vUv - 0.5) * 2.0;
  float a = exp(-dot(c, c) * 3.0) * 0.55;
  gl_FragColor = vec4(uColor * a, 1.0);
  ${OUTPUT}
}
`;

/* ---------- sun lens flare: one full-screen additive pass, drawn last ----------
   Starburst + anamorphic streak at the sun, a few chromatic ghosts mirrored through
   the centre of the frame, and a faint halo ring. uVis carries the occlusion by the
   planets (computed on the CPU from their angular radii), so the flare blooms as the
   sun clears a limb and dies when it sets. */
export const flareVertex = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const flareFrag = /* glsl */ `
uniform vec2 uSun;      // sun position in NDC
uniform float uAspect;
uniform float uVis;     // 0 hidden … 1 fully visible
uniform float uGlare;   // extra burst while the sun sits right on a limb
uniform vec3 uTint;
varying vec2 vNdc;

float disc(vec2 p, vec2 c, float r, float soft) {
  return smoothstep(r, r * (1.0 - soft), length((p - c) * vec2(uAspect, 1.0)));
}

void main() {
  vec2 d = (vNdc - uSun) * vec2(uAspect, 1.0);
  float r = length(d);
  float a = atan(d.y, d.x);

  // core and wide soft glow
  float glow = exp(-r * 10.0) * 0.7 + exp(-r * 3.0) * 0.08 + 0.0015 / (r * r + 0.0015) * 0.3;
  // starburst: 6 long spikes, 14 fine ones, fading with distance
  float spikes = pow(abs(cos(a * 3.0 + 0.4)), 160.0) + pow(abs(cos(a * 7.0 + 1.1)), 90.0) * 0.3;
  spikes *= exp(-r * (6.0 - uGlare * 2.5)) * 0.6;
  // anamorphic streak
  float streak = exp(-abs(d.y) * 220.0) * exp(-abs(d.x) * 1.8) * 0.4;

  vec3 col = uTint * (glow + spikes) + vec3(0.55, 0.75, 1.0) * streak;

  // ghosts along the sun → centre axis, mirrored to the other side
  vec2 axis = -uSun;
  col += vec3(0.30, 0.55, 1.00) * disc(vNdc, uSun + axis * 0.55, 0.03, 0.6) * 0.12;
  col += vec3(1.00, 0.60, 0.25) * disc(vNdc, uSun + axis * 1.25, 0.05, 0.3) * 0.05;
  col += vec3(0.45, 1.00, 0.70) * disc(vNdc, uSun + axis * 1.55, 0.016, 0.5) * 0.12;
  // faint halo ring
  float ring = exp(-pow((r - 0.62) * 22.0, 2.0)) * 0.05;
  col += vec3(0.6, 0.8, 1.0) * ring;

  gl_FragColor = vec4(col * uVis * (0.8 + uGlare * 0.5), 1.0);
  ${OUTPUT}
}
`;
