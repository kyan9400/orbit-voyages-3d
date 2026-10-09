import { ImageResponse } from "next/og";

export const alt = "Orbit Voyages — Leave the planet. Keep the view.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const STARS = Array.from({ length: 70 }, (_, i) => {
  const x = (i * 397) % 1200;
  const y = (i * 211 + (i % 7) * 37) % 630;
  const s = i % 9 === 0 ? 3 : i % 3 === 0 ? 2 : 1;
  return { x, y, s, o: 0.35 + ((i * 13) % 50) / 100 };
});

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "#04050a",
          color: "#eef1f8",
          fontFamily: "serif",
        }}
      >
        {STARS.map((st, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: st.x,
              top: st.y,
              width: st.s,
              height: st.s,
              borderRadius: 9,
              background: "#ffffff",
              opacity: st.o,
            }}
          />
        ))}
        {/* Earth crescent, lower left */}
        <div
          style={{
            position: "absolute",
            left: -260,
            top: 300,
            width: 620,
            height: 620,
            borderRadius: 620,
            backgroundImage: "radial-gradient(circle at 78% 30%, #9fd7ff 0%, #2a6fb8 22%, #0b2346 45%, #04070f 70%)",
            boxShadow: "0 0 90px rgba(90,160,255,0.45)",
          }}
        />
        {/* Mars, upper right */}
        <div
          style={{
            position: "absolute",
            right: 90,
            top: 70,
            width: 300,
            height: 300,
            borderRadius: 300,
            backgroundImage: "radial-gradient(circle at 70% 32%, #ffb88f 0%, #e0683a 30%, #7a2a10 62%, #1c0803 85%)",
            boxShadow: "0 0 70px rgba(255,122,69,0.35)",
          }}
        />
        {/* trajectory */}
        <div
          style={{
            position: "absolute",
            left: 200,
            top: 150,
            width: 900,
            height: 520,
            borderRadius: 900,
            border: "2px dashed rgba(127,212,255,0.45)",
            transform: "rotate(-14deg)",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", position: "absolute", left: 80, top: 70, width: 700 }}>
          <div style={{ fontSize: 22, letterSpacing: 6, color: "#7fd4ff", fontFamily: "monospace" }}>
            ORBIT VOYAGES · EARTH → MARS
          </div>
          <div style={{ fontSize: 92, lineHeight: 1, marginTop: 28 }}>Leave the planet.</div>
          <div style={{ fontSize: 92, lineHeight: 1, color: "#ff7a45", fontStyle: "italic" }}>Keep the view.</div>
          <div style={{ fontSize: 26, marginTop: 30, color: "#a7b0c6", fontFamily: "sans-serif" }}>
            Twelve seats. Seven months. One red horizon.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
