// Novacia AI — tiny web server: serves the chat page and streams answers from the AI brain.
// The API key lives only here (as an environment variable on the host), never in the page.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const PORT = Number(process.env.PORT) || 3000;
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY || "";
const BRAIN = (process.env.NOVACIA_BRAIN || (GEMINI_KEY ? "gemini" : CLAUDE_KEY ? "claude" : "none")).toLowerCase();
const GEMINI_BASE = process.env.GEMINI_BASE || "https://generativelanguage.googleapis.com";
const CLAUDE_BASE = process.env.CLAUDE_BASE || "https://api.anthropic.com";

const MODELS = { haul: "Haul 1.0", kein: "Kein 1.0" };
const EFFORTS = {
  faible: { tokens: 1500, style: "Keep every answer short and simple: a few clear sentences, easy words." },
  normal: { tokens: 4096, style: "Give complete, well-organized answers. Use short paragraphs, and lists or headings when they help." },
  fast: { tokens: 2000, style: "Answer fast and direct. Lead with the answer, skip long introductions, keep it brief." },
};

function systemPrompt(model, effort) {
  return [
    `You are Novacia, the AI assistant of Novacia AI, running on the model ${MODELS[model]}.`,
    "Your personality: friendly, smart, encouraging and honest. You help with anything: questions, homework and studying, writing, ideas, languages and coding.",
    "Always reply in the same language the user writes in (for example English, Arabic or French), including dialects.",
    "If someone asks who or what you are, say you are Novacia, made by Novacia AI.",
    "Format answers in Markdown when it helps.",
    "Answer style: " + EFFORTS[effort].style,
  ].join("\n");
}

// ---------- tiny per-visitor rate limit (protects the key from abuse) ----------
const hits = new Map();
function limited(ip) {
  const now = Date.now(), win = 10 * 60 * 1000, max = 40;
  const list = (hits.get(ip) || []).filter((t) => now - t < win);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > win) hits.delete(k);
  return list.length > max;
}

// ---------- Gemini: pick the best free Flash models automatically ----------
let geminiModels = null;
async function pickGeminiModels() {
  if (geminiModels) return geminiModels;
  const fallback = { haul: ["gemini-flash-latest", "gemini-2.5-flash"], kein: ["gemini-flash-lite-latest", "gemini-2.5-flash-lite"] };
  try {
    const r = await fetch(`${GEMINI_BASE}/v1beta/models?pageSize=200`, { headers: { "x-goog-api-key": GEMINI_KEY } });
    if (!r.ok) throw new Error("list " + r.status);
    const data = await r.json();
    const names = (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""))
      .filter((n) => /flash/.test(n) && !/(tts|live|image|audio|embed|thinking|exp|native)/.test(n));
    const ver = (n) => { const m = n.match(/(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
    const stable = (n) => (/preview/.test(n) ? 0 : 1);
    const rank = (a, b) => stable(b) - stable(a) || ver(b) - ver(a) || a.length - b.length;
    const full = names.filter((n) => !/lite/.test(n)).sort(rank);
    const lite = names.filter((n) => /lite/.test(n)).sort(rank);
    geminiModels = {
      haul: [process.env.GEMINI_MODEL_HAUL, ...full, ...fallback.haul].filter(Boolean),
      kein: [process.env.GEMINI_MODEL_KEIN, ...lite, ...full, ...fallback.kein].filter(Boolean),
    };
  } catch (e) {
    console.error("Could not list Gemini models:", e.message);
    geminiModels = { haul: [process.env.GEMINI_MODEL_HAUL, ...fallback.haul].filter(Boolean), kein: [process.env.GEMINI_MODEL_KEIN, ...fallback.kein].filter(Boolean) };
  }
  console.log("Gemini models:", JSON.stringify(geminiModels));
  return geminiModels;
}

async function* sseLines(body) {
  const dec = new TextDecoder(); let buf = "";
  for await (const chunk of body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i).replace(/\r$/, ""); buf = buf.slice(i + 1); yield line; }
  }
  if (buf) yield buf;
}

async function streamGemini({ model, effort, turns }, write) {
  const cands = (await pickGeminiModels())[model];
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt(model, effort) }] },
    contents: turns.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] })),
    generationConfig: { maxOutputTokens: EFFORTS[effort].tokens, temperature: 0.8 },
  });
  let lastStatus = 0;
  for (const name of [...new Set(cands)].slice(0, 4)) {
    const r = await fetch(`${GEMINI_BASE}/v1beta/models/${encodeURIComponent(name)}:streamGenerateContent?alt=sse`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_KEY }, body,
    });
    if (!r.ok) { lastStatus = r.status; console.error("Gemini", name, r.status, (await r.text()).slice(0, 300)); continue; }
    let wrote = false;
    for await (const line of sseLines(r.body)) {
      if (!line.startsWith("data:")) continue;
      try {
        const j = JSON.parse(line.slice(5));
        const parts = j.candidates?.[0]?.content?.parts || [];
        for (const p of parts) if (p.text && !p.thought) { write(p.text); wrote = true; }
        if (j.promptFeedback?.blockReason && !wrote) throw Object.assign(new Error("blocked"), { code: "refused" });
      } catch (e) { if (e.code) throw e; }
    }
    if (!wrote) throw Object.assign(new Error("empty"), { code: "empty" });
    return;
  }
  throw Object.assign(new Error("gemini " + lastStatus), { code: lastStatus === 429 ? "busy" : "upstream" });
}

async function streamClaude({ model, effort, turns }, write) {
  const name = model === "haul" ? (process.env.CLAUDE_MODEL_HAUL || "claude-sonnet-5-5") : (process.env.CLAUDE_MODEL_KEIN || "claude-haiku-5-5");
  const r = await fetch(`${CLAUDE_BASE}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": CLAUDE_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: name, max_tokens: EFFORTS[effort].tokens, system: systemPrompt(model, effort), messages: turns, stream: true }),
  });
  if (!r.ok) { console.error("Claude", r.status, (await r.text()).slice(0, 300)); throw Object.assign(new Error("claude " + r.status), { code: r.status === 429 ? "busy" : "upstream" }); }
  let wrote = false;
  for await (const line of sseLines(r.body)) {
    if (!line.startsWith("data:")) continue;
    try { const j = JSON.parse(line.slice(5)); if (j.type === "content_block_delta" && j.delta?.text) { write(j.delta.text); wrote = true; } } catch {}
  }
  if (!wrote) throw Object.assign(new Error("empty"), { code: "empty" });
}

// ---------- request validation ----------
function clean(body) {
  const model = MODELS[body?.model] ? body.model : "haul";
  if (body?.effort === "ultra") return { error: "locked" };
  const effort = EFFORTS[body?.effort] ? body.effort : "normal";
  let turns = Array.isArray(body?.turns) ? body.turns : [];
  turns = turns
    .filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.trim())
    .map((t) => ({ role: t.role, content: t.content.slice(0, 6000) }));
  // keep the newest turns within ~24k characters, starting on a user turn
  let total = 0, start = turns.length;
  for (let i = turns.length - 1; i >= 0; i--) { total += turns[i].content.length; if (total > 24000) break; start = i; }
  turns = turns.slice(start);
  while (turns.length && turns[0].role !== "user") turns.shift();
  // merge consecutive same-role turns (APIs want alternation)
  const merged = [];
  for (const t of turns) { const last = merged[merged.length - 1]; if (last && last.role === t.role) last.content += "\n\n" + t.content; else merged.push({ ...t }); }
  if (!merged.length || merged[merged.length - 1].role !== "user") return { error: "bad_request" };
  return { model, effort, turns: merged };
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
const SEC = { "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin", "x-frame-options": "SAMEORIGIN" };

async function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = normalize(join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403, SEC).end(); return; }
  try {
    const s = await stat(file); if (!s.isFile()) throw 0;
    const data = await readFile(file);
    res.writeHead(200, { ...SEC, "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": extname(file) === ".html" ? "no-cache" : "public, max-age=86400" });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(404, { ...SEC, "content-type": "text/plain; charset=utf-8" }).end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/healthz") { res.writeHead(200, { "content-type": "text/plain" }).end("ok"); return; }
  if (url.pathname === "/api/status") {
    res.writeHead(200, { ...SEC, "content-type": "application/json" }).end(JSON.stringify({ ready: BRAIN !== "none" })); return;
  }
  if (url.pathname === "/api/chat") {
    if (req.method !== "POST") { res.writeHead(405, SEC).end(); return; }
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString().split(",")[0].trim();
    const fail = (status, code) => res.writeHead(status, { ...SEC, "content-type": "application/json" }).end(JSON.stringify({ error: code }));
    if (BRAIN === "none") return fail(503, "not_configured");
    if (limited(ip)) return fail(429, "busy");
    let raw = "";
    for await (const c of req) { raw += c; if (raw.length > 200000) return fail(413, "too_long"); }
    let body; try { body = JSON.parse(raw); } catch { return fail(400, "bad_request"); }
    const job = clean(body);
    if (job.error === "locked") return fail(403, "locked");
    if (job.error) return fail(400, job.error);
    let started = false;
    const write = (text) => {
      if (!started) { res.writeHead(200, { ...SEC, "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" }); started = true; }
      res.write(text);
    };
    const ac = new AbortController();
    req.on("close", () => ac.abort());
    try {
      await (BRAIN === "claude" ? streamClaude : streamGemini)(job, write, ac.signal);
      if (!started) write("");
      res.end();
    } catch (e) {
      const code = e.code || "upstream";
      if (!started) return fail(code === "busy" ? 429 : 502, code);
      res.end("\n\n\u0000ERR:" + code);
    }
    return;
  }
  if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res);
  res.writeHead(405, SEC).end();
});

server.listen(PORT, () => console.log(`Novacia AI listening on :${PORT} (brain: ${BRAIN})`));
