// Checks the Claude request the AI builder sends and how it reads replies,
// against a local mock of the Messages API (no real key or network needed).

import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

let mock: Server;
let lastBody: Record<string, unknown> = {};
let lastHeaders: IncomingMessage["headers"] = {};
let reply: () => { status: number; body: unknown } = () => ({ status: 500, body: {} });

function message(text: string, stopReason = "end_turn") {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

before(async () => {
  mock = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      lastHeaders = req.headers;
      lastBody = raw ? JSON.parse(raw) : {};
      const r = reply();
      res.writeHead(r.status, { "content-type": "application/json", "request-id": "req_test" });
      res.end(JSON.stringify(r.body));
    });
  });
  await new Promise<void>((resolve) => mock.listen(0, "127.0.0.1", resolve));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = "test-key";
  delete process.env.AI_MODEL;
});

after(() => {
  mock.close();
});

const ctx = { botName: "Bolt", playerName: "Sam", recentPieces: ["Hull Section"] };

test("sends a structured-output request with server-side fallbacks", async () => {
  const { aiPiece, aiConfigured } = await import("../server/ai");
  assert.ok(aiConfigured());
  const piece = { name: "Red Sail", description: "A sail", role: "sail", width: 2, length: 1, power: 5, parts: [] };
  reply = () => ({ status: 200, body: message(JSON.stringify({ message: "Here you go!", piece })) });
  const result = await aiPiece("a red sail", ctx);
  assert.equal(result.message, "Here you go!");
  assert.deepEqual(result.piece, piece);

  assert.equal(lastBody.model, "claude-opus-5-5");
  assert.equal(lastBody.fallbacks, "default");
  assert.match(String(lastHeaders["anthropic-beta"]), /server-side-fallback-2026-07-01/);
  const config = lastBody.output_config as { effort: string; format: { type: string; schema: { required: string[] } } };
  assert.equal(config.effort, "low");
  assert.equal(config.format.type, "json_schema");
  assert.deepEqual(config.format.schema.required, ["message", "piece"]);
  const user = (lastBody.messages as { role: string; content: string }[])[0];
  assert.equal(user.role, "user");
  assert.match(user.content, /<request>a red sail<\/request>/);
  assert.match(user.content, /Bolt/);
  assert.ok(!("thinking" in lastBody), "thinking is left at the model default");
});

test("refusals and broken JSON throw so the workshop can take over", async () => {
  const { aiPiece } = await import("../server/ai");
  reply = () => ({ status: 200, body: message("", "refusal") });
  await assert.rejects(aiPiece("something", ctx), /declined/);
  reply = () => ({ status: 200, body: message("not json") });
  await assert.rejects(aiPiece("something", ctx), /JSON/);
  reply = () => ({ status: 200, body: message(JSON.stringify({ message: "hi" })) });
  await assert.rejects(aiPiece("something", ctx), /no piece/);
});

test("a rejected API key pauses the AI instead of retrying every request", async () => {
  const { aiPiece, aiAvailable } = await import("../server/ai");
  reply = () => ({ status: 401, body: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } });
  const quiet = console.error;
  console.error = () => {};
  try {
    await assert.rejects(aiPiece("something", ctx));
  } finally {
    console.error = quiet;
  }
  assert.equal(aiAvailable(), false);
});
