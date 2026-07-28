# Mage Keno

Fantasy 40-number Keno (5×8). Pick up to 10 numbers; the mage shoots 20 fireballs at the draw. Hits explode; misses grey out.

## Stack

React 19 + Vite + TypeScript + Tailwind CSS v4 + HTML5 Canvas (`requestAnimationFrame`).

## Local

```bash
npm install
npm run dev
```

Production build (committed `dist/` is what TriBet iframes):

```bash
npm run build
```

Open `dist/index.html` or TriBet lobby → **Mage Keno**.

## Mage sprite

Replace `public/assets/mage.png` with your own art, then rebuild. Transparent PNG recommended.
