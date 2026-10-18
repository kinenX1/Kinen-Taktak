# Novacia AI

A free AI assistant website. Ask anything, in any language. Pick **Haul 1.0** (deep) or **Kein 1.0** (fast), and an effort level.

## How it works
- `public/index.html` is the chat page.
- `server.js` serves the page and streams answers from the AI brain. The API key stays on the server and never reaches the browser.
- Brain: **Google Gemini** by default (set `GEMINI_API_KEY`). To switch to Claude later, set `ANTHROPIC_API_KEY` and `NOVACIA_BRAIN=claude`.

## Run it on Render
1. New → Blueprint → pick this repo (it reads `render.yaml`).
2. Paste your Gemini key into `GEMINI_API_KEY` when Render asks.
3. Deploy. Your site is at `https://novacia-ai.onrender.com` (or the name Render gives it).

## Run it on your computer
```
GEMINI_API_KEY=your-key node server.js
```
Then open http://localhost:3000
