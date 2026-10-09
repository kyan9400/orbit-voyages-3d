import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Lost in transit",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main id="main" className="lost">
      <div className="lost__sky" aria-hidden="true">
        <span className="lost__planet" />
        <span className="lost__orbit" />
        <span className="lost__probe" />
      </div>
      <div className="lost__body">
        <p className="eyebrow">Error 404 · Signal lost</p>
        <h1>
          Lost in <em>transit.</em>
        </h1>
        <p className="lead">This page drifted out of its orbit. The ship is still on course.</p>
        <Link className="btn" href="/">
          Return to Earth
        </Link>
      </div>
      <p className="lost__foot">© 2026 Alhassan Alfarran · Concept project — fictional brand.</p>
    </main>
  );
}
