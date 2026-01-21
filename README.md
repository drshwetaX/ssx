# SSx (v1) — Instrument-led Conversational UI

This is a starter UI that mirrors the “MDx-style” layout:
- Left: **New Chat** + sessions + **Instruments**
- Right: landing prompts + chat thread + option chips
- LocalStorage persistence for sessions (no backend yet)

## Run locally
```bash
npm install
npm run dev
```
Open http://localhost:3000

## Share with anyone (no domain required)
You have 3 easy options:

**Option A — Vercel (fastest)**
1. Push this folder to GitHub
2. Import into Vercel
3. Vercel gives you a free public URL (you can later add a custom domain)

**Option B — Netlify**
Same idea: connect repo → deploy → get a public URL.

**Option C — Zip + run locally**
Share the zip. The other person runs `npm install` + `npm run dev`.

## Next steps (v2)
- Add backend orchestrator endpoints:
  - POST /sessions
  - GET /modules
  - POST /chat (SSE streaming)
  - POST /modules/:id/run
  - GET /sessions/:id/audit
- Replace the mock responder with real routing + tool runs.
