/*
  GLSL for Orbit Voyages. Everything visible is generated here.

  BAKE shaders run once at start-up: they paint equirectangular maps into render
  targets (the planet surfaces, clouds, city lights, the nebula sky). The noise is
  evaluated on the 3D sphere direction, so the maps have no seams.
  RENDER shaders run every frame and only read those maps, which keeps the
  per-pixel cost low on integrated GPUs and phones.

  Colour maps store sqrt(linear colour) in 8-bit channels (cheap gamma-2 encoding,
  no banding in the dark oceans); render shaders square them back.
*/

/* ---------- shared noise ---------- */
const NOISE = /* glsl */ `
// hash adapted from "Hash without Sine" by David Hoskins (MIT)
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash13(i);
  float b = hash13(i + vec3(1.0, 0.0, 0.0));
  float c = hash13(i + vec3(0.0, 1.0, 0.0));
  float d = hash13(i + vec3(1.0, 1.0, 0.0));
  float e = hash13(i + vec3(0.0, 0.0, 1.0));
  float f1 = hash13(i + vec3(1.0, 0.0, 1.0));
  float g = hash13(i + vec3(0.0, 1.0, 1.0));
  float h = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, f1, u.x), mix(g, h, u.x), u.y), u.z);
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

/* ---------- Earth ---------- */
const EARTH_HEIGHT = /* glsl */ `
const float SEA = 0.535;
float earthHeight(vec3 d, out vec3 w) {
  vec3 p = d * 1.55 + vec3(3.7, 1.3, 8.1);
  w = vec3(fbm(p * 1.3 + 11.0), fbm(p * 1.3 + 23.0), fbm(p * 1.3 + 37.0)) - 0.5;
  float h = fbm(p + w * 0.95);
  h += (fbm(d * 9.0 + w * 2.0) - 0.5) * 0.09;
  return h;
}
`;

export const earthSurfaceFrag = /* glsl */ `
varying vec2 vUv;
${NOISE}
${EARTH_HEIGHT}
void main() {
  vec3 d = dirFromUv(vUv);
  vec3 w;
  float h = earthHeight(d, w);
  float lat = abs(d.y);

  float ocean = 1.0 - smoothstep(SEA - 0.003, SEA + 0.003, h);
  float depth = clamp((SEA - h) / 0.16, 0.0, 1.0);
  vec3 oceanCol = mix(vec3(0.020, 0.115, 0.190), vec3(0.004, 0.022, 0.065), smoothstep(0.0, 0.55, depth));

  float elev = clamp((h - SEA) / 0.2, 0.0, 1.0);
  float moist = fbm(d * 3.1 + w + 5.0);
  float aridity = moist * 0.75 + exp(-pow((lat - 0.42) * 4.5, 2.0)) * 0.38;
  float grain = fbm(d * 22.0 + w * 3.0);
  vec3 green = mix(vec3(0.035, 0.090, 0.030), vec3(0.110, 0.170, 0.050), grain);
  vec3 desert = mix(vec3(0.42, 0.30, 0.17), vec3(0.62, 0.47, 0.28), grain);
  vec3 land = mix(green, desert, smoothstep(0.56, 0.70, aridity));
  land = mix(land, vec3(0.20, 0.20, 0.15), smoothstep(0.55, 0.85, lat));           // tundra
  land = mix(land, vec3(0.26, 0.22, 0.19), smoothstep(0.45, 0.85, elev) * 0.8);    // mountains
  vec3 col = mix(land, oceanCol, ocean);

  float ice = smoothstep(0.80, 0.84, lat + (fbm(d * 6.0) - 0.5) * 0.14);
  ice = max(ice, (1.0 - ocean) * smoothstep(0.82, 0.95, elev));
  col = mix(col, vec3(0.80, 0.85, 0.90), ice);
  ocean *= 1.0 - ice;

  gl_FragColor = vec4(sqrt(col), ocean);
}
`;

export const earthDataFrag = /* glsl */ `
varying vec2 vUv;
${NOISE}
${EARTH_HEIGHT}
void main() {
  vec3 d = dirFromUv(vUv);
  vec3 w;
  float h = earthHeight(d, w);
  float lat = abs(d.y);
  float land = smoothstep(SEA - 0.002, SEA + 0.004, h);

  // clouds: warped noise stretched along latitude, with tropical and storm-track belts
  vec3 q = vec3(d.x, d.y * 1.7, d.z) * 2.6;
  vec3 cw = vec3(fbm(q * 1.4 + 3.0), fbm(q * 1.4 + 9.0), fbm(q * 1.4 + 17.0)) - 0.5;
  float c = fbm(q + cw * 1.8);
  float belts = 0.5 + 0.5 * cos(asin(d.y) * 6.0);
  c = c * 0.86 + belts * 0.12 + (fbm(d * 15.0 + cw * 3.0) - 0.5) * 0.28;
  float clouds = smoothstep(0.50, 0.74, c);

  // city lights: populated coasts and temperate bands, as fine specks
  float pop = smoothstep(0.55, 0.78, fbm(d * 4.5 + 40.0)) * (1.0 - smoothstep(0.55, 0.78, lat));
  float coast = 1.0 - smoothstep(0.0, 0.05, h - SEA);
  float speck = smoothstep(0.70, 0.95, vnoise(d * 170.0)) * 0.8 + smoothstep(0.80, 0.97, vnoise(d * 430.0)) * 0.6;
  float lights = clamp(land * (pop * 0.85 + coast * pop * 0.7) * speck, 0.0, 1.0);

  float height = land * clamp((h - SEA) / 0.2, 0.0, 1.0);
  gl_FragColor = vec4(clouds, lights, height, 1.0);
}
`;

/* ---------- rocky worlds (Mars, Moon) ---------- */
export const rockyBakeFrag = /* glsl */ `
varying vec2 vUv;
uniform vec3 uDark;
uniform vec3 uBase;
uniform vec3 uBright;
uniform float uCap;
uniform float uCanyon;
uniform float uCraters;
uniform float uMaria;
uniform float uSeed;
${NOISE}

// bowl-shaped craters with raised rims, one per lucky cell
float craters(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float h = 0.0;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 cell = i + g;
    float exists = step(0.55, hash13(cell + 9.9));
    vec3 o = vec3(hash13(cell), hash13(cell + 17.1), hash13(cell + 31.7));
    float r = 0.22 + 0.22 * hash13(cell + 5.3);
    float x2 = length(g + o - f) / r;
    float bowl = (x2 * x2 - 1.0) * (1.0 - step(1.0, x2));
    float rim = exp(-pow((x2 - 1.0) * 4.0, 2.0)) * 0.45;
    h += exists * (bowl * 0.7 + rim);
  }
  return h;
}

void main() {
  vec3 d = dirFromUv(vUv);
  vec3 p = d + uSeed;
  vec3 w = vec3(fbm(p * 2.0 + 1.0), fbm(p * 2.0 + 7.0), fbm(p * 2.0 + 13.0)) - 0.5;
  float base = fbm(p * 2.1 + w * 0.8);
  float cr = craters(p * 5.0) * 0.55 + craters(p * 11.0 + 3.0) * 0.32 + craters(p * 24.0 + 7.0) * 0.18;
  float h = 0.5 + (base - 0.5) * 0.9 + cr * 0.10 * uCraters + (fbm(p * 18.0) - 0.5) * 0.07;

  // one long canyon system south of the equator (Valles-like)
  float wiggle = (fbm(d * 4.0 + 2.0) - 0.5) * 0.10;
  float canyon = uCanyon * smoothstep(0.045, 0.0, abs(d.y + 0.14 + wiggle))
    * smoothstep(0.08, 0.20, vUv.x) * smoothstep(0.62, 0.45, vUv.x);
  h -= canyon * 0.22;

  float region = fbm(p * 1.35 + w * 1.2 + 21.0);
  float maria = smoothstep(0.50, 0.63, region) * uMaria;
  vec3 col = mix(uBase, uDark, maria);
  col = mix(col, uBright, smoothstep(0.55, 0.78, h) * 0.55);
  col *= 0.82 + 0.36 * fbm(d * 34.0 + w);
  col = mix(col, uDark * 0.75, canyon * 0.6);

  float n = (fbm(d * 8.0) - 0.5) * 0.07;
  float cap = uCap * (smoothstep(0.935, 0.955, d.y + n) + 0.8 * smoothstep(0.95, 0.97, -d.y + n));
  col = mix(col, vec3(0.86, 0.84, 0.82), clamp(cap, 0.0, 1.0));

  gl_FragColor = vec4(sqrt(max(col, 0.0)), clamp(h, 0.0, 1.0));
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
  col += vec3(0.130, 0.035, 0.070) * smoothstep(0.56, 0.82, fbm(d * 2.4 + 50.0)) * 0.30;
  col += vec3(0.020, 0.060, 0.100) * smoothstep(0.52, 0.80, fbm(d * 2.0 + 90.0)) * 0.30;
  gl_FragColor = vec4(sqrt(col * 0.55), 1.0);
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
uniform sampler2D uSurface;
uniform sampler2D uData;
uniform vec3 uSun;
uniform float uCloud;
uniform float uLights; // intro: 0 = city lights off, 1 = all on
uniform vec2 uTexel;
uniform float uBump;
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
  vec4 data = texture2D(uData, vUv);
  float lightsMap = data.g;
  float c = texture2D(uData, vUv + vec2(uCloud, 0.0)).r;
  float shadow = texture2D(uData, vUv + vec2(uCloud - 0.003, 0.002)).r;

  // relief: land height (ocean is 0) tilts the normal, shading mountains near the terminator
  vec3 N = Ng;
  #ifdef RELIEF
  float hu = texture2D(uData, vUv + vec2(uTexel.x, 0.0)).b;
  float hv = texture2D(uData, vUv + vec2(0.0, uTexel.y)).b;
  N = normalize(Ng - uBump * ((hu - data.b) * normalize(vT) + (hv - data.b) * normalize(vB)));
  #endif

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
uniform float uInner;
uniform float uIntensity;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vT;
varying vec3 vB;
varying vec3 vP;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vP);
  float k = clamp(-dot(N, V), 0.0, 1.0);          // 0 at the outer edge of the shell
  float glow = pow(smoothstep(0.0, uInner, k), 2.6);
  float sunSide = smoothstep(-0.4, 0.6, dot(N, uSun));
  float forward = pow(max(dot(-V, uSun), 0.0), 6.0); // sun behind the planet
  vec3 col = mix(uColor, uSunset, clamp((1.0 - sunSide) * 0.6 + forward * 0.5, 0.0, 1.0));
  float a = glow * (sunSide + forward * 1.6) * uIntensity;
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
  mv.xy += position.xy * uSize;
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
  float a = core * len * bands * uBurn * 1.3;
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
