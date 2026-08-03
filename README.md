# Mage Keno

Fantasy **40-number Keno** (5×8 grid). Pick up to 10 spots; the mage draws 20 fireballs. Hits stun goblins; payouts by hit count (**~97% RTP**, house edge **~3%** on every spot count — hypergeometric N=40, K=20).

| Field | Value |
| --- | --- |
| **Game Class** | **A — Iframe** (TriBet Studio) |
| **Display profile** | `flexible` (`provider:mage-keno` in `src/lib/gameDisplay.js`) |
| **Minimum viewport** | Mobile 320×568 · Desktop 960×600 (from Flexible profile) |
| **Entry** | `/games/mage-keno/dist/index.html` |
| **Platform standard** | [`docs/design/tribet-originals-platform-standard.md`](../../../docs/design/tribet-originals-platform-standard.md) (BOY-36) |

## Compliance (BOY-36 MANDATORY floor)

| Rule | Mage Keno |
| --- | --- |
| Mount only inside GameStage | ✅ sandboxed iframe via `ProviderGame` |
| Never alter shell / routing / wallet internals | ✅ no host DOM / router access |
| Emit `GameReady` (`ready`) | ✅ `utils/bridge.ts` → host `init` |
| Host owns settlement RNG when embedded | ✅ weighted hit-count outcomes via bridge `bet` |
| Declare Game Profile | ✅ `FLEXIBLE` in `src/lib/gameDisplay.js` |
| No audio before user gesture | ✅ unlock on first pointer/key |
| Release audio / RAF / listeners on teardown | ✅ canvas/cloud effect cleanups |
| Never call Fullscreen API | ✅ none |
| Respect `prefers-reduced-motion` | ✅ CSS disables hit/miss/flip motion |

Standalone (`npm run dev`) keeps a local mock economy when not embedded.

## Stack

React 19 + Vite + TypeScript + Tailwind CSS v4 + Canvas.

## Local

```bash
npm install
npm run dev
npm run build   # commits dist/ for TriBet iframe
```

## Assets

| File | Role |
| --- | --- |
| `mage.mp4` / `mage-cast.mp4` | Idle / cast (chroma-keyed) |
| `staff-impact.*` | Firestorm behind mage during reveals |
| `cast-spell.mp3` | Cast SFX (synced to staff hit) |
| `fireball-whoosh.mp3` | Per-reveal whoosh |
| `goblin-hit.mp3` | Match / KO grunt |
| `pick-goblin.webm` / `pick-mark-hit.png` | Pick / stunned marks |
