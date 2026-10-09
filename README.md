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
- Fonts via `next/font/google`; OG image via `next/og`; favicon `app/icon.svg`

Pinned versions follow the shared `STACK.md`. GSAP and Lenis are intentionally **not** installed: the page uses
native scrolling and a single damping layer inside the 3D rig (PERF-RULES rule 5, "or skip Lenis entirely"),
which keeps the first-load bundle small.

## The signature 3D technique
- **Planets baked on the GPU at start-up.** Fragment shaders paint seamless equirectangular maps into render targets
  (fBm value noise with domain warping on the sphere direction, crater cells, a canyon system, polar caps):
  Earth albedo + ocean mask, Earth clouds / city lights / height, Mars, the Moon and a nebula sky. The per-frame
  shaders only sample these maps, so they stay cheap on integrated GPUs and phones.
- **Shading:** day/night terminator, ocean glint, drifting clouds with offset cloud shadows, warm city lights on the
  night side, bump-mapped relief on Mars and the Moon, a sunset tint along the terminator.
- **Atmosphere glow:** additive back-face shells whose fresnel peaks exactly at the planet's limb, brighter on the
  sun side, with forward scattering when the sun is behind the planet.
- **Starfield + nebula** that follow the camera (infinitely far), with a milky-way band and colour temperatures.
- **Flight streaks:** line segments whose length follows the camera's velocity — dots at rest, streaks at speed.
- **Camera rig:** centripetal Catmull-Rom curves through six shots, one per section; separate framing for portrait screens.

### Performance
- `frameloop="demand"`: scrolling invalidates; the rig renders every frame only while it settles; ambient motion
  (planet spin, clouds, ring) runs at ~30 fps and never in a hidden tab.
- Quality tier chosen before the canvas exists (GPU name, cores, memory, touch; `?quality=low|medium|high`), sets
  DPR cap, antialiasing, bake size, star and streak counts. Frame-time watcher lowers the DPR on slow GPUs.
- Shaders compiled with `compileAsync` behind a poster before the canvas fades in.
- 3D chunk loaded with `next/dynamic({ ssr: false })` after the browser is idle. No `backdrop-filter` anywhere.
- `prefers-reduced-motion` respected by default (camera cuts between shots, no ambient motion) with a
  "Turn on full motion" toggle (`?motion=full` also works). Without WebGL a code-made SVG poster stays in place.

## Run it
```bash
npm install
npm run dev     # http://localhost:3000
npm run build
npm run lint
```

## Project layout
```
src/app/            layout, page, 404, globals.css, icon.svg, opengraph-image, robots, sitemap
src/components/     Backdrop (poster + lazy canvas), FlightTracker (scroll → shot, HUD), MotionToggle
src/three/          FlightCanvas (R3F wrapper), world.ts (scene + camera rig), shaders.ts (GLSL)
src/lib/            flight store, quality tiers, motion preference
public/poster.svg   no-WebGL / pre-load poster
SPEC.md             concept, copy, design system, budgets
```

## Credits
See [CREDITS.md](CREDITS.md). All 3D content is procedural; fonts are SIL OFL.

---
© 2026 Alhassan Alfarran. See [LICENSE](LICENSE).
