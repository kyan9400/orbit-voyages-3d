# Orbit Voyages — scroll-driven flight from Earth to Mars

A portfolio concept site for a fictional space-tourism line. The page is the voyage: as you scroll, the camera
leaves low Earth orbit, passes the Moon, flies alongside the cruiser and arrives in orbit around Mars. Each section
of copy is one leg of the trip.

**Live:** https://orbit-voyages-3d.vercel.app

> Concept project — fictional brand.

## Tech stack
- Next.js 16 (App Router, TypeScript strict, `src/`), React 19
- three.js 0.186 + @react-three/fiber 9 (render-on-demand canvas)
- Tailwind CSS 4 (`@theme` design tokens) + hand-written CSS
- Fonts via `next/font/google` (Instrument Serif, Space Grotesk, Space Mono; only the two Instrument Serif files are preloaded); social image `app/opengraph-image.png` / `twitter-image.png` (a screenshot of the live site); favicon `app/icon.svg`

Pinned versions follow the shared `STACK.md`. GSAP and Lenis are intentionally **not** installed: the page uses
native scrolling and a single damping layer inside the 3D rig (PERF-RULES rule 5, "or skip Lenis entirely"),
which keeps the first-load bundle small.

## The signature 3D technique
- **Real planets from NASA imagery.** Earth is the Blue Marble (with an ocean mask for the sun glint), Black Marble
  city lights on the night side and the Blue Marble cloud layer; the Moon is the LRO colour map with LOLA elevation
  as a bump map; Mars is the Viking colour mosaic. The maps are packed offline into WebP (≈1.6 MB for both tiers,
  2048 px on the high tier, 1024 px elsewhere), downloaded with the 3D chunk and decoded off the main thread with
  `createImageBitmap`. The hero frame looks down on India at night; the Moon flyby crosses the far side (Mare
  Moscoviense); the Mars approach faces Tharsis with Olympus Mons on the dawn terminator. Close up, each city-light
  texel is split into points of light so low orbit reads as clusters of cities rather than blurred squares.
- **Nebula sky baked on the GPU at start-up** (fBm value noise with domain warping on the sphere direction).
- **Shading:** day/night terminator, ocean glint, drifting clouds with offset cloud shadows, warm city lights on the
  night side, LOLA bump-mapped relief on the Moon, a sunset tint along the terminator.
- **Atmosphere glow:** additive back-face shells whose fresnel peaks exactly at the planet's limb, brighter on the
  sun side, with forward scattering when the sun is behind the planet.
- **Starfield + nebula** that follow the camera (infinitely far), with a milky-way band and colour temperatures.
- **Flight streaks:** line segments whose length follows the camera's velocity — dots at rest, streaks at speed.
- **Camera rig:** centripetal Catmull-Rom curves through six shots, one per section; separate framing for portrait screens.
- **The cruiser (`src/three/ship.ts`):** a smooth lathe hull from a spline profile (welded seam, smooth normals),
  clearcoat paint, a brushed anisotropic habitat ring that catches the sun as it spins, iridescent gold-foil tanks,
  procedural solar cells (generated `DataTexture` as colour + roughness), a glossy panorama dome lit from inside,
  72 instanced cabin windows, panel lines, radiator fins, a docking collar, nav lights and a nose strobe.
  Reflections from a `RoomEnvironment` PMREM (code-made, no HDRI). Low tier falls back to standard materials.
- **Signature moment — trans-Mars injection:** between the ship and the coast sections the engine ignites (hot nozzle,
  additive exhaust plume with shock diamonds) while the camera rides alongside and does a **dolly zoom** — the lens
  narrows while the camera backs away, so the ship holds its size while space stretches behind it — then the ship
  pulls away toward Mars and shrinks to a spark. It is a
  pure function of scroll position, so reduced motion shows clean cuts. The HUD reads "Burn" meanwhile.
- **"Lights on" intro:** as the canvas fades in over the poster, the Earth's night side switches on city by city
  (brightest first) and the sun brightens.
- **Planet details:** a wind-broken ocean glint, earthshine on the Moon's night side,
  a dusty haze band along the Martian terminator, and a noise-shaped Phobos with two crater dimples.

### Performance
- `frameloop="demand"`: scrolling invalidates; the rig renders every frame only while it settles; ambient motion
  (planet spin, clouds, ring) runs at ~30 fps and never in a hidden tab.
- Quality tier chosen before the canvas exists (GPU name, cores, memory, touch; `?quality=low|medium|high`), sets
  DPR cap, antialiasing, planet-map size, star and streak counts. Frame-time watcher lowers the DPR on slow GPUs.
- Shaders compiled with `compileAsync` behind a poster before the canvas fades in.
- 3D chunk loaded with `next/dynamic({ ssr: false })` only after window `load` + an idle callback + a tiny GPU probe;
  software renderers (SwiftShader, llvmpipe, …) never download it and keep the poster (`?quality=…` forces 3D on).
  The world is built in slices that yield to the main thread (the PMREM environment is its own slice), and every
  material — including the exhaust plume — is compiled before the canvas is shown. No `backdrop-filter` anywhere.
- Desktop pointer polish (custom cursor, magnetic buttons) is its own ~1 KB chunk, imported after `load` + idle
  only for a fine pointer with full motion.
- Full motion by default; the "Reduce motion" toggle (remembered, or `?motion=reduced`) switches to camera cuts
  between shots with no ambient motion. Without WebGL a code-made SVG poster stays in place.

## Run it
```bash
npm install
npm run dev     # http://localhost:3000
npm run build
npm run lint
npm run build:pages   # static GitHub Pages mirror in out/ (basePath /orbit-voyages-3d)
```

## Project layout
```
src/app/            layout, page, 404, globals.css, icon.svg, opengraph/twitter image (PNG + alt), robots, sitemap
src/components/     Backdrop (poster + lazy canvas), FlightTracker (scroll → shot, HUD), MobileMenu, MotionToggle, PointerFx
src/three/          FlightCanvas (R3F wrapper), world.ts (scene + camera rig + burn), ship.ts (the cruiser), glow.ts, shaders.ts (GLSL)
src/lib/            flight store, quality tiers, motion preference, pointer (lazy cursor + magnetic buttons)
public/poster.svg   no-WebGL / pre-load poster
public/textures/    NASA planet maps (Earth, Moon, Mars) packed as WebP
SPEC.md             concept, copy, design system, budgets
```

## Credits
See [CREDITS.md](CREDITS.md). Planet surfaces are public-domain NASA imagery; everything else is procedural; fonts are SIL OFL.

---
© 2026 Alhassan Alfarran. See [LICENSE](LICENSE).
