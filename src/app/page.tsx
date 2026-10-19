import type { CSSProperties } from "react";
import Backdrop from "@/components/Backdrop";
import FlightTracker from "@/components/FlightTracker";
import MobileMenu from "@/components/MobileMenu";
import MotionToggle from "@/components/MotionToggle";
import PointerFx from "@/components/PointerFx";

const EMAIL = "kyan775909@gmail.com";
const SITE_URL = "https://orbit-voyages-3d.vercel.app";
const PORTFOLIO = "https://alhassan-portfolio-sigma.vercel.app";

/* Structured data: the site and its author only (the brand is fictional, so no product or offer data). */
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Orbit Voyages",
  url: SITE_URL,
  description:
    "Orbit Voyages flies twelve passengers at a time from low Earth orbit to Mars. Scroll the seven-month flight in real-time 3D.",
  author: { "@type": "Person", name: "Alhassan Alfarran", url: PORTFOLIO },
};

/** stagger index for split-line reveals */
const at = (i: number) => ({ "--i": i }) as CSSProperties;
const seatMail = (fare: string) =>
  `mailto:${EMAIL}?subject=${encodeURIComponent(`Orbit Voyages — ${fare}`)}`;

const SECTIONS = [
  { href: "#route", label: "The route" },
  { href: "#ship", label: "The ship" },
  { href: "#aboard", label: "Aboard" },
  { href: "#mars", label: "Mars" },
  { href: "#book", label: "Fares" },
];
const HEADER_CTA = { href: "#book", label: "Book a seat" };

const LEGS = [
  {
    n: "01",
    title: "Ascent",
    when: "Day 0–3",
    body: "Launch from Port Meridian, dock with the cruiser in a 400 km parking orbit, and spend three days watching a sunrise every ninety minutes.",
  },
  {
    n: "02",
    title: "Lunar slingshot",
    when: "Day 4",
    body: "A close pass behind the Moon bends our path and saves a week of fuel. Most guests see the far side here for the first time.",
  },
  {
    n: "03",
    title: "Trans-Mars injection",
    when: "Day 5",
    body: "Six minutes of engine burn. After that the ship falls toward Mars on a curve calculated two years in advance.",
  },
  {
    n: "04",
    title: "The coast",
    when: "Day 6–208",
    body: "Two hundred days of quiet. Earth shrinks to a blue star; Mars grows from a spark to a coin.",
  },
  {
    n: "05",
    title: "Aerocapture",
    when: "Day 210",
    body: "The ship skims the Martian upper atmosphere to brake for free, then settles into orbit.",
  },
];

const FEATURES = [
  {
    k: "0.38 g",
    title: "Spun gravity",
    body: "A 64-metre ring turns four times a minute for Mars-normal gravity, so you arrive walking.",
  },
  {
    k: "6 m",
    title: "Panorama deck",
    body: "A fused-silica dome faces the direction of travel. It is the quietest room in the solar system.",
  },
  {
    k: "12 / 12",
    title: "Storm shelter",
    body: "A water-walled core protects every guest during solar storms. Drills are weekly; naps are optional.",
  },
  {
    k: "9 m²",
    title: "Private cabins",
    body: "A bunk that folds into a desk, a soft amber reading light and your own porthole.",
  },
];

const DAY = [
  { time: "07:00", title: "Ring sunrise", body: "Cabin lights warm slowly over twenty minutes." },
  { time: "08:30", title: "Training", body: "Simulated hull walks, medical basics and Mars surface protocol." },
  { time: "12:00", title: "Long table", body: "Crew and guests eat together, mostly from the hydroponic bay." },
  { time: "15:00", title: "Free hours", body: "Library, observatory, letters home — up to 22 minutes each way." },
  { time: "21:00", title: "Dome time", body: "The lights go out and the stars come on." },
];

const SIGHTS = [
  { title: "Olympus Mons at dawn", body: "Three times the height of Everest, seen edge-on as the terminator crosses it." },
  { title: "Valles Marineris", body: "A canyon as long as a continent, traced from orbit on a slow polar pass." },
  { title: "Phobos rendezvous", body: "Float alongside a moon nine kilometres wide that is slowly falling toward its planet." },
  { title: "Jezero landing", body: "Surface fare only: eleven days in a pressurised habitat on an ancient river delta." },
];

const FARES = [
  {
    name: "Lunar Loop",
    span: "9 days",
    body: "Earth orbit, a far-side pass and home. The perfect rehearsal.",
    price: "1.2 M",
    featured: false,
  },
  {
    name: "Mars Orbit Return",
    span: "17 months",
    body: "The full flight, forty days in Mars orbit, then home on the next window.",
    price: "9.8 M",
    featured: true,
  },
  {
    name: "Mars Surface",
    span: "26 months",
    body: "Everything in Orbit Return, plus eleven days on the ground at Jezero.",
    price: "18.5 M",
    featured: false,
  },
];

/** Section index for eyebrows ("02 / 06 — "): decorative, the label after it is the real text. */
function Index({ n }: { n: number }) {
  return (
    <span className="eyebrow__n" aria-hidden="true">
      {String(n).padStart(2, "0")} / 06 —{" "}
    </span>
  );
}

function Arrow() {
  return (
    <svg className="btn__arrow" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
      <path d="M1 7h11M8 3l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Logo() {
  return (
    <svg className="logo__mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="6" fill="currentColor" />
      <ellipse cx="16" cy="16" rx="14" ry="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" transform="rotate(-24 16 16)" />
      <circle cx="28.2" cy="10.4" r="2" fill="var(--color-ember)" />
    </svg>
  );
}

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        // static, server-rendered JSON (no user input)
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }}
      />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Backdrop />

      <header className="site-header">
        <a className="logo" href="#launch" aria-label="Orbit Voyages, back to top">
          <Logo />
          <span className="logo__word">
            Orbit<span>Voyages</span>
          </span>
        </a>
        <nav aria-label="Primary" className="site-nav">
          <ul>
            {SECTIONS.map((s) => (
              <li key={s.href}>
                <a href={s.href}>{s.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="site-header__actions">
          <a className="btn btn--small site-header__cta" href={HEADER_CTA.href}>
            {HEADER_CTA.label}
            <Arrow />
          </a>
          <MobileMenu links={SECTIONS} cta={HEADER_CTA} />
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        {/* 0 — HERO */}
        <section id="launch" data-shot="0" className="section hero" aria-labelledby="hero-title">
          <div className="wrap">
            <p className="eyebrow hero__eyebrow">
              <Index n={1} />
              Passenger flights · Earth → Mars · Departures from 2031
            </p>
            {/* The LCP element: server-rendered, fully opaque from the first paint (entrance moves it, never fades it). */}
            <h1 id="hero-title" className="hero__title">
              <span className="hero__line">Leave the planet.</span> <em className="hero__line">Keep the view.</em>
            </h1>
            <p className="lead hero__lead">
              Orbit Voyages flies twelve passengers at a time from low Earth orbit to the red horizons of Mars. Seven
              months out, a lifetime after.
            </p>
            <div className="hero__ctas">
              <a className="btn" href="#book">
                Plan your voyage
                <Arrow />
              </a>
              <a className="btn btn--ghost" href="#route">
                See the route
                <Arrow />
              </a>
            </div>
            <dl className="facts">
              <div>
                <dt>Average transit</dt>
                <dd>225 M km</dd>
              </div>
              <div>
                <dt>Coast phase</dt>
                <dd>7 months</dd>
              </div>
              <div>
                <dt>Per departure</dt>
                <dd>12 seats</dd>
              </div>
            </dl>
          </div>
          <p className="scroll-cue" aria-hidden="true">
            Scroll to fly
          </p>
        </section>

        {/* 1 — ROUTE */}
        <section id="route" data-shot="1" className="section" aria-labelledby="route-title">
          <div className="wrap">
            <div className="panel panel--wide reveal">
              <p className="eyebrow">
                <Index n={2} />
                The route
              </p>
              <h2 id="route-title">
                <span className="line" style={at(0)}>
                  Five legs,
                </span>{" "}
                <span className="line" style={at(1)}>
                  <em>one long exhale.</em>
                </span>
              </h2>
              <ol className="legs">
                {LEGS.map((leg) => (
                  <li key={leg.n} className="leg">
                    <span className="leg__n" aria-hidden="true">
                      {leg.n}
                    </span>
                    <div>
                      <h3>
                        {leg.title} <span className="leg__when">{leg.when}</span>
                      </h3>
                      <p>{leg.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* 2 — SHIP */}
        <section id="ship" data-shot="2" className="section" aria-labelledby="ship-title">
          <div className="wrap">
            <div className="panel panel--wide reveal">
              <p className="eyebrow">
                <Index n={3} />
                The ship
              </p>
              <h2 id="ship-title">
                <span className="line" style={at(0)}>
                  The Meridian-class
                </span>{" "}
                <span className="line" style={at(1)}>
                  <em>cruiser.</em>
                </span>
              </h2>
              <p className="lead">
                Built for long nights, not short thrills. Every system has a twin, and every cabin has a window.
              </p>
              <ul className="features">
                {FEATURES.map((f) => (
                  <li key={f.title} className="feature">
                    <p className="feature__k">{f.k}</p>
                    <h3>{f.title}</h3>
                    <p>{f.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* 3 — ABOARD */}
        <section id="aboard" data-shot="3" className="section" aria-labelledby="aboard-title">
          <div className="wrap">
            <div className="panel reveal">
              <p className="eyebrow">
                <Index n={4} />
                Life aboard
              </p>
              <h2 id="aboard-title">
                <span className="line" style={at(0)}>
                  A day on
                </span>{" "}
                <span className="line" style={at(1)}>
                  <em>the coast.</em>
                </span>
              </h2>
              <ol className="day">
                {DAY.map((d) => (
                  <li key={d.time}>
                    <time className="day__time">{d.time}</time>
                    <div>
                      <h3>{d.title}</h3>
                      <p>{d.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <figure className="quote">
                <blockquote>
                  <p>“By month three you stop counting days and start counting stars.”</p>
                </blockquote>
                <figcaption>Commander Ilse Varga, flight lead</figcaption>
              </figure>
            </div>
          </div>
        </section>

        {/* 4 — MARS */}
        <section id="mars" data-shot="4" className="section" aria-labelledby="mars-title">
          <div className="wrap">
            <div className="panel reveal">
              <p className="eyebrow eyebrow--ember">
                <Index n={5} />
                Arrival · Day 210
              </p>
              <h2 id="mars-title">
                <span className="line" style={at(0)}>
                  Mars,
                </span>{" "}
                <span className="line" style={at(1)}>
                  <em>up close.</em>
                </span>
              </h2>
              <ul className="sights">
                {SIGHTS.map((s) => (
                  <li key={s.title}>
                    <h3>{s.title}</h3>
                    <p>{s.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* 5 — FARES */}
        <section id="book" data-shot="5" className="section section--fares" aria-labelledby="book-title">
          <div className="wrap">
            <div className="fares-head reveal">
              <p className="eyebrow">
                <Index n={6} />
                Voyages &amp; fares
              </p>
              <h2 id="book-title">
                <span className="line" style={at(0)}>
                  Choose your
                </span>{" "}
                <span className="line" style={at(1)}>
                  <em>distance.</em>
                </span>
              </h2>
            </div>
            <ul className="fares">
              {FARES.map((f) => (
                <li key={f.name} className={`fare reveal${f.featured ? " fare--featured" : ""}`}>
                  {f.featured && <p className="fare__tag">Most requested</p>}
                  <h3>{f.name}</h3>
                  <p className="fare__span">{f.span}</p>
                  <p className="fare__body">{f.body}</p>
                  <p className="fare__price">
                    <span className="fare__from">from</span> {f.price} <span className="fare__unit">credits</span>
                  </p>
                  <a className={`btn ${f.featured ? "" : "btn--ghost"} fare__cta`} href={seatMail(f.name)}>
                    Request a seat<span className="sr-only"> on {f.name}</span>
                    <Arrow />
                  </a>
                </li>
              ))}
            </ul>
            <p className="fine reveal">
              Fares are illustrative. Departures follow the 26-month Earth–Mars launch window. Medical clearance
              required.
            </p>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap footer__grid">
          <div>
            <p className="footer__brand">
              <Logo /> Orbit Voyages
            </p>
            <p className="footer__note">Concept project — fictional brand.</p>
          </div>
          <div>
            <h2 className="footer__h">Design &amp; development</h2>
            <p className="footer__name">Alhassan Alfarran</p>
            <ul className="footer__links">
              <li><a href={`mailto:${EMAIL}`}>Email</a></li>
              <li><a href="https://t.me/hassan_9400" rel="noopener noreferrer" target="_blank">Telegram<span className="sr-only"> (opens in a new tab)</span></a></li>
              <li><a href="https://wa.me/79193999749" rel="noopener noreferrer" target="_blank">WhatsApp<span className="sr-only"> (opens in a new tab)</span></a></li>
              <li><a href="https://github.com/kyan9400" rel="noopener noreferrer" target="_blank">GitHub<span className="sr-only"> (opens in a new tab)</span></a></li>
              <li><a href={process.env.NEXT_PUBLIC_PORTFOLIO_URL ?? PORTFOLIO} rel="noopener noreferrer" target="_blank">Portfolio<span className="sr-only"> (opens in a new tab)</span></a></li>
            </ul>
          </div>
          <div className="footer__end">
            <MotionToggle />
            <p className="footer__copy">© 2026 Alhassan Alfarran</p>
          </div>
        </div>
      </footer>

      <FlightTracker />
      <PointerFx />
    </>
  );
}
