"use client";

/** Last-resort boundary when the root layout itself fails. Keeps styling self-contained. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#060709", color: "#f4f2ec", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ padding: 24, maxWidth: 520 }}>
          <p style={{ color: "#ff5a1f", letterSpacing: "0.14em", fontSize: 12, textTransform: "uppercase" }}>MovEra</p>
          <h1 style={{ fontSize: 40, lineHeight: 1.05, letterSpacing: "-0.04em", margin: "16px 0" }}>We hit an unexpected problem.</h1>
          <p style={{ color: "#a2a5ad", lineHeight: 1.6 }}>Please try again in a moment.</p>
          <button
            onClick={reset}
            style={{ marginTop: 24, height: 48, padding: "0 24px", borderRadius: 999, border: 0, background: "#ff5a1f", color: "#060709", fontWeight: 600, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
