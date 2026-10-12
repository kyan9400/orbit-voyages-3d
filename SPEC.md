# Orbit Voyages — site spec

## Concept
Orbit Voyages is a fictional passenger line that flies paying crews from Earth orbit to Mars. The site is one long
scroll that *is* the voyage: the camera starts in low Earth orbit, passes the Moon, coasts through deep space past our
cruiser, and arrives in orbit around Mars. Each section of copy is one leg of the trip.

Tone: calm, precise, a little poetic. Mission-control telemetry meets a luxury travel brochure.

## Audience
- Primary: studio clients and recruiters judging creative-dev skill (real-time 3D, shaders, performance).
- In-fiction: affluent, curious travellers who want facts (duration, gravity, radiation, price), not hype.

## Sections (6) and camera shots
| # | id | Section | Shot |
|---|----|---------|------|
| 0 | `launch` | Hero | Close on Earth, night side and city lights on the left, sunrise rim |
| 1 | `route` | The route | High orbit, Earth limb below, Moon ahead |
| 2 | `ship` | The ship | Deep space beside the Meridian-class cruiser, ring turning |
| 3 | `aboard` | Life aboard | The long coast, Mars a red point ahead, flight streaks |
| 4 | `mars` | Arrival | Mars fills the frame, thin dusty atmosphere |
| 5 | `book` | Voyages & fares | Wide Mars orbit with Phobos |
Footer: contact, motion toggle, copyright, disclaimer.

## Signature 3D moment
**A scroll-driven flight from Earth to Mars.** Everything is made in code:

- **Procedural planets, baked once on the GPU.** At start-up, fragment shaders render equirectangular maps
  (fBm value noise with domain warping, crater cells, canyon carving, polar caps) into render targets with mipmaps.
  Earth gets albedo + ocean mask and a data map (clouds, city lights, height). Mars and the Moon use the same
  "rocky world" baker with different palettes. Baking happens behind the canvas loader, then the shaders are compiled
  with `gl.compileAsync` before the canvas fades in.
- **Planet shading:** day/night terminator, ocean specular glint, drifting clouds with cloud shadows, warm city
  lights on the night side, bump-mapped relief on Mars/Moon, sunset tint at the terminator.
- **Atmosphere glow:** back-face shell with an additive fresnel shader, brighter on the sun side and with forward
  scattering when the sun is behind the planet (blue for Earth, dusty salmon for Mars).
- **Starfield:** points on a far shell with a milky-way band and colour temperatures, plus a baked nebula sky sphere.
- **Flight streaks:** line segments along the route whose length follows the camera velocity — dots at rest,
  streaks when scrolling fast.
- **Camera rig:** centripetal Catmull-Rom curves for position and look target through 6 shots; the shot index comes
  from section offsets (shot *i* is reached when section *i* reaches the top). Portrait screens use a second set of
  curves framed around each shot's subject and a wider FOV.
- **Sun:** billboard glow far away along the light direction.
- **Cruiser:** procedural geometry (spine, rotating habitat ring with spokes, solar wings, engine glow).

### Quality tiers (decided before the Canvas exists)
| | high | medium | low |
|---|---|---|---|
| DPR cap | 2 | 1.5 | 1 |
| Antialias | yes | yes | no |
| Planet bake | 2048×1024 | 1024×512 | 1024×512 (Mars 512) |
| Stars | 7000 | 4000 | 2000 |
| Flight streaks | 1400 | 800 | 350 |
| Ambient loop | 30 fps | 30 fps | 30 fps |
Detection: WebGL2 probe + GPU name (`WEBGL_debug_renderer_info`); software renderers (SwiftShader, llvmpipe, softpipe,
Microsoft Basic Render, or a context that fails `failIfMajorPerformanceCaveat`) → no 3D at all, the poster stays
(`?quality=` still forces the 3D on); Intel/AMD integrated,
Mali, Adreno, PowerVR, touch devices → at most medium; ≤2 cores or ≤2 GB → low. `?quality=low|medium|high` overrides.
drei `PerformanceMonitor` steps the DPR down on decline.

### Render on demand
`frameloop="demand"`. Scroll invalidates; the rig damps toward the target and keeps invalidating only until it settles.
The ambient effects (planet spin, cloud drift, ring rotation) request frames at ~30 fps, never in a hidden tab.

### Reduced motion
Default follows `prefers-reduced-motion`; a "Turn on full motion" toggle (localStorage `orbit-motion`, `?motion=full`
override). Reduced = no ambient spin/drift, no damped sweeps: the camera **cuts** to the shot of the current section.

### No WebGL / context lost
A designed code-made SVG poster (`public/poster.svg`: Earth crescent, Mars, star dust, trajectory arc) is always the
bottom layer; the canvas fades in over it only when ready, and is removed on context loss. Page is fully usable without 3D.

## Design system
**Palette**
| token | hex | use |
|---|---|---|
| void | `#04050A` | page background |
| hull | `#0B0E18` | panels |
| hull-2 | `#121728` | raised panels |
| line | `#26304A` | hairlines |
| ink | `#EEF1F8` | text (18:1 on void) |
| ink-dim | `#A7B0C6` | secondary text (9:1) |
| ember | `#FF7A45` | Mars accent, primary buttons (dark text `#1A0903`) |
| aurora | `#7FD4FF` | Earth accent, telemetry |

**Fonts** (Google Fonts, OFL, via `next/font`): Instrument Serif (display, incl. italic), Space Grotesk (body/UI),
Space Mono (telemetry labels).

**Spacing scale** (4 px base): 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128 · 192 (`--space-1` … `--space-11`).
Type scale: 0.75 / 0.875 / 1 / 1.125 / 1.375 / 2 / 3 rem; h2 clamp(2.75rem, 7vw, 6rem); hero clamp(3.25rem, min(10.5vw, 14svh), 10rem).

## Copy

**Nav:** The route · The ship · Aboard · Mars · Fares · [Book a seat]

**Hero** — eyebrow "Passenger flights · Earth → Mars · Departures from 2031"
H1: "Leave the planet. *Keep the view.*"
Lead: "Orbit Voyages flies twelve passengers at a time from low Earth orbit to the red horizons of Mars. Seven months
out, a lifetime after."
CTAs: "Plan your voyage" · "See the route". Facts: 225 million km average transit · 7 months coast · 12 seats per departure.

**The route** — H2 "Five legs, one long exhale."
1. Ascent — Day 0–3. "Launch from Port Meridian, dock with the cruiser in a 400 km parking orbit, and spend three days
   watching sunrises every ninety minutes."
2. Lunar slingshot — Day 4. "A close pass behind the Moon bends our path and saves a week of fuel. Most guests see the
   far side here for the first time."
3. Trans-Mars injection — Day 5. "Six minutes of engine burn. After that the ship falls toward Mars on a curve
   calculated two years in advance."
4. The coast — Day 6–208. "Two hundred days of quiet. Earth shrinks to a blue star, Mars grows from a spark to a coin."
5. Aerocapture — Day 210. "The ship skims the Martian upper atmosphere to brake for free, then settles into orbit."

**The ship** — H2 "The Meridian-class cruiser."
Lead: "Built for long nights, not short thrills. Every system has a twin, and every cabin has a window."
- Spun gravity — "A 64-metre ring turns four times a minute for Mars-normal 0.38 g, so you arrive walking."
- Panorama deck — "A six-metre fused-silica dome faces the direction of travel. It is the quietest room in the solar system."
- Storm shelter — "A water-walled core protects all twelve guests during solar storms. Drills are weekly; naps are optional."
- Private cabins — "Nine square metres, a bunk that folds into a desk, and your own porthole."

**Life aboard** — H2 "A day on the coast."
Schedule: 07:00 Ring sunrise — lights warm slowly over twenty minutes. 08:30 Training — hull walks in simulation, medical
basics, Mars surface protocol. 12:00 Long table — crew and guests eat together; food grown in the hydroponic bay.
15:00 Free hours — library, observatory, letters home (delay up to 22 minutes each way). 21:00 Dome time — the lights go
out and the stars come on. Quote: "By month three you stop counting days and start counting stars." — Commander Ilse
Varga, flight lead (fictional).

**Arrival** — H2 "Mars, up close."
- Olympus Mons at dawn — "Three times the height of Everest, seen edge-on as the terminator crosses it."
- Valles Marineris — "A canyon as long as a continent, traced from orbit on a slow polar pass."
- Phobos rendezvous — "Float alongside a moon nine kilometres wide that is slowly falling toward its planet."
- Jezero landing (surface fare only) — "Eleven days in a pressurised habitat on an ancient river delta."

**Voyages & fares** — H2 "Choose your distance."
- Lunar Loop — 9 days — "Earth orbit, a far-side pass and home. The perfect rehearsal." — from 1.2 M credits.
- Mars Orbit Return — 17 months — "The full flight, forty days in Mars orbit, then home on the next window." — from 9.8 M credits.
- Mars Surface — 26 months — "Everything in Orbit Return plus eleven days on the ground at Jezero." — from 18.5 M credits.
Fine print: "Fares are illustrative. Departures follow the 26-month Earth–Mars launch window. Medical clearance required."
CTA: "Request a seat" (mailto).

**Footer:** "Orbit Voyages" · "Concept project — fictional brand." · "Design & development: Alhassan Alfarran" + email,
Telegram, WhatsApp, GitHub, portfolio · motion toggle · "© 2026 Alhassan Alfarran".

**404:** "Lost in transit." — "This page drifted out of its orbit. The ship is still on course." → "Return to Earth".

## Assets & licenses
- 3D: all procedural, written for this project (no models, no textures, no HDRIs).
- Poster, favicon, OG image: code-made (SVG / `next/og`).
- Fonts: Instrument Serif, Space Grotesk, Space Mono — SIL OFL 1.1 via `next/font/google`.
- Hash function in shaders adapted from "Hash without Sine" (David Hoskins, MIT).
- npm libraries: MIT (next, react, three, @react-three/fiber, @react-three/drei).

## Performance budget
- First-load JS for `/` < 250 KB gzip excluding the lazy 3D chunk (no GSAP/Lenis: native scroll + one damping layer).
- 3D chunk loaded with `next/dynamic({ ssr:false })` only after window `load` + `requestIdleCallback` (2.5 s timeout)
  and the GPU probe; never during hydration. HTML/LCP text renders immediately. World built in slices (yield between
  GPU bakes and before `compileAsync`).
- GPU memory: ≤ 5 baked maps (≤ 2048×1024 RGBA8).
- Draw calls ≈ 20; zero allocations in `useFrame`; no React state per frame.
- Lighthouse mobile: Perf ≥ 85, A11y/BP/SEO ≥ 95. No backdrop-filter; panels are solid gradients.
