"use client";

/** Last-resort boundary when the root layout itself fails. Keeps styling self-contained. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#e7e6e2", color: "#151514", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ padding: 24, maxWidth: 520 }}>
          <p style={{ letterSpacing: "0.14em", fontSize: 12, textTransform: "uppercase", color: "#55544f" }}>NovaWear</p>
          <h1 style={{ fontSize: 44, lineHeight: 1, textTransform: "uppercase", margin: "16px 0", fontWeight: 900 }}>Something went wrong.</h1>
          <p style={{ color: "#3a3a37", lineHeight: 1.6 }}>Please try again in a moment.</p>
          <button
            onClick={reset}
            style={{ marginTop: 24, height: 52, padding: "0 28px", border: 0, background: "#151514", color: "#ece8df", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
