"use client";

/*
  Turns the scroll position into the flight's shot position and drives the
  telemetry HUD. Shot i is reached when section i's top is a quarter of the
  way down the viewport. DOM text is written directly (no React re-renders).
*/
import { useEffect, useRef } from "react";
import { flight, telemetry, SHOT_COUNT } from "@/lib/flight";
import { readReducedMotion } from "@/lib/motion";
import MotionToggle from "./MotionToggle";

const LEGS = ["Earth orbit", "Lunar slingshot", "Cruise", "The coast", "Mars approach", "Mars orbit"];
const BURN = { from: 2.15, to: 2.85, label: "Burn" }; // the engine fires between the ship and the coast
const NAV = [
  { id: "launch", label: "Launch" },
  { id: "route", label: "The route" },
  { id: "ship", label: "The ship" },
  { id: "aboard", label: "Life aboard" },
  { id: "mars", label: "Arrival" },
  { id: "book", label: "Fares" },
];

export default function FlightTracker() {
  const dayRef = useRef<HTMLSpanElement>(null);
  const distRef = useRef<HTMLSpanElement>(null);
  const legRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const hudRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let anchors: number[] = [];
    let raf = 0;
    let lastActive = -1;
    let lastLabel = "";
    let maxScroll = 1;
    const root = document.documentElement;
    // the progress line reads --p from the header only, so setting it there restyles one element, not the page
    const header = document.querySelector<HTMLElement>(".site-header");
    // The HUD steps aside whenever it would sit on top of page content.
    let obstacles: HTMLElement[] = [];
    let hudBox = { top: 0, right: 0, bottom: 0, left: 0 };
    let hudAway = false;
    const PAD = 12;

    const measure = () => {
      const vh = window.innerHeight;
      const max = Math.max(1, document.documentElement.scrollHeight - vh);
      maxScroll = max;
      const list: number[] = [0];
      for (let i = 1; i < SHOT_COUNT; i++) {
        const el = document.querySelector<HTMLElement>(`[data-shot="${i}"]`);
        const top = el ? el.getBoundingClientRect().top + window.scrollY - vh * 0.25 : max;
        list.push(Math.max(list[i - 1] + 1, Math.min(max, top)));
      }
      anchors = list;

      const hud = hudRef.current;
      if (hud) {
        const r = hud.getBoundingClientRect(); // position: fixed, so this only changes on resize
        hudBox = { top: r.top - PAD, right: r.right + PAD, bottom: r.bottom + PAD, left: r.left - PAD };
      }
      const wide = window.matchMedia("(min-width: 48rem)").matches;
      obstacles = Array.from(
        document.querySelectorAll<HTMLElement>(
          wide ? ".facts, .hero__ctas, .panel, .fares, .fine, .footer__grid" : ".facts, .hero__ctas",
        ),
      );
    };

    const apply = () => {
      raf = 0;
      const y = window.scrollY;
      let p = SHOT_COUNT - 1;
      for (let i = 0; i < SHOT_COUNT - 1; i++) {
        if (y < anchors[i + 1]) {
          const span = Math.max(1, anchors[i + 1] - anchors[i]);
          p = i + Math.min(1, Math.max(0, (y - anchors[i]) / span));
          break;
        }
      }
      flight.target = p;
      flight.invalidate?.();

      const hud = hudRef.current;
      if (hud) {
        let hit = false;
        for (const el of obstacles) {
          const b = el.getBoundingClientRect();
          if (b.bottom > hudBox.top && b.top < hudBox.bottom && b.right > hudBox.left && b.left < hudBox.right) {
            hit = true;
            break;
          }
        }
        // never pull it away from under a keyboard user
        if (hit && hud.contains(document.activeElement)) hit = false;
        if (hit !== hudAway) {
          hudAway = hit;
          if (hit) hud.setAttribute("data-away", "");
          else hud.removeAttribute("data-away");
        }
      }

      const t = telemetry(p);
      if (dayRef.current) dayRef.current.textContent = String(Math.round(t.day)).padStart(3, "0");
      if (distRef.current) distRef.current.textContent = t.dist < 10 ? t.dist.toFixed(2) : t.dist.toFixed(1);
      if (barRef.current) barRef.current.style.transform = `scaleX(${p / (SHOT_COUNT - 1)})`;
      // page progress line under the header (transform only)
      header?.style.setProperty("--p", Math.min(1, Math.max(0, y / maxScroll)).toFixed(4));
      const active = Math.min(SHOT_COUNT - 1, Math.round(p));
      const label = p > BURN.from && p < BURN.to ? BURN.label : LEGS[active];
      if (label !== lastLabel) {
        lastLabel = label;
        if (legRef.current) legRef.current.textContent = label;
      }
      if (active !== lastActive) {
        lastActive = active;
        railRef.current?.querySelectorAll("a").forEach((a, i) => {
          if (i === active) a.setAttribute("aria-current", "step");
          else a.removeAttribute("aria-current");
        });
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onResize = () => {
      measure();
      onScroll();
    };

    measure();
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(document.body);
    document.fonts?.ready.then(onResize);

    // reveal-on-scroll for section content (opacity/transform only)
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }),
      { rootMargin: "0px 0px -8% 0px" },
    );
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    // entrance animations follow the visitor's motion choice, not only the OS setting
    root.dataset.motion = readReducedMotion() ? "reduced" : "full";
    root.classList.add("reveal-ready");

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <aside className="hud" aria-label="Flight telemetry" ref={hudRef}>
        <p className="hud__row">
          <span className="hud__label">T+</span> <span ref={dayRef}>000</span> d
          <span className="hud__dist">
            <span className="hud__sep" aria-hidden="true">
              /
            </span>
            <span ref={distRef}>0.00</span> M km
          </span>
        </p>
        <p className="hud__leg">
          <span ref={legRef}>{LEGS[0]}</span>
        </p>
        <span className="hud__bar" aria-hidden="true">
          <span ref={barRef} />
        </span>
        <MotionToggle className="hud__motion" />
      </aside>
      <nav className="rail" aria-label="Voyage legs" ref={railRef}>
        <ol>
          {NAV.map((n, i) => (
            <li key={n.id}>
              <a href={`#${n.id}`} aria-current={i === 0 ? "step" : undefined}>
                <span className="rail__dot" aria-hidden="true" />
                <span className="rail__label">{n.label}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
