import { ImageResponse } from "next/og";

export const alt = "MovEra — Digital experiences that move businesses forward";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Default social card for every page without its own image. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "radial-gradient(70% 80% at 85% 10%, rgba(255,90,31,0.35), transparent 60%), #060709",
          color: "#f4f2ec",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>
          <svg width="56" height="40" viewBox="0 0 28 20">
            <path d="M2 18 7 2h3L5 18z" fill="#f4f2ec" opacity="0.35" />
            <path d="M9 18 14 2h3.5L12.5 18z" fill="#f4f2ec" opacity="0.65" />
            <path d="M16 18 21 2h5l-5 16z" fill="#ff5a1f" />
          </svg>
          MOVeRA
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 84, fontWeight: 600, lineHeight: 1, letterSpacing: -4 }}>
          <span>We build digital experiences</span>
          <span>
            that <span style={{ color: "#ff5a1f", margin: "0 18px" }}>move</span> businesses forward.
          </span>
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#a2a5ad" }}>Websites · Apps · Software · Digital products</div>
      </div>
    ),
    size,
  );
}
