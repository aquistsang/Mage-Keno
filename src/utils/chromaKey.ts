export type ChromaKeyOpts = {
  keyR?: number;
  keyG?: number;
  keyB?: number;
  /** How far from key color counts as background (0–1). Higher = more aggressive. */
  similarity?: number;
  /** Soft edge width (0–1). Lower = harder cut. */
  blend?: number;
  /** 0–1 strength of green spill removal on remaining pixels. */
  despill?: number;
  maxKeyWidth?: number;
};

function colorDist(r: number, g: number, b: number, keyR: number, keyG: number, keyB: number): number {
  const dr = r - keyR;
  const dg = g - keyG;
  const db = b - keyB;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** Warm fire / glow — never key out. */
function isFireTone(r: number, g: number, b: number): boolean {
  return r >= 140 && r >= g && r > b + 25;
}

/**
 * Character blues / purples — protect so outfit doesn't flicker.
 * Kept narrow so real greenscreen (low B) is never protected.
 */
function isCharacterTone(r: number, g: number, b: number): boolean {
  if (isFireTone(r, g, b)) return true;
  // Blue / indigo / purple: B clearly leads
  if (b > g + 8 && b >= 60) return true;
  if (r >= 80 && b >= 80 && b >= g && g < Math.min(r, b) + 12) return true;
  return false;
}

/**
 * Unmistakable greenscreen pixel (high G, low R & B).
 * Safe to remove even when not edge-connected — blue outfits never match this.
 * Slightly loose to catch green trapped around staff flame.
 */
function isPureScreenGreen(r: number, g: number, b: number): boolean {
  if (isCharacterTone(r, g, b) || isFireTone(r, g, b)) return false;
  return g >= 120 && r <= 110 && b <= 100 && g >= r + 35 && g >= b + 35;
}

/** Softer spill / near-key green used only for edge flood membership. */
function isSpillGreen(r: number, g: number, b: number): boolean {
  if (isCharacterTone(r, g, b) || isFireTone(r, g, b)) return false;
  if (isPureScreenGreen(r, g, b)) return true;
  return g >= 110 && g > r + 22 && g > b + 22 && r < 140 && b < 125;
}

/**
 * Edge-connected chroma key + global pure-green kill.
 * Blues stay; leftover green pockets (staff/fire holes) get cleared.
 */
export function chromaKeyClean(
  imageData: ImageData,
  keyR = 25,
  keyG = 225,
  keyB = 13,
  similarity = 0.46,
  blend = 0.05,
  despill = 0.85,
): void {
  const { data, width, height } = imageData;
  const maxDist = similarity * 255 * Math.SQRT2;
  const blendDist = Math.max(1, blend * 255 * Math.SQRT2);
  const n = width * height;
  const isKey = new Uint8Array(n);

  const keyScore = (i: number) => {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    if (isCharacterTone(r, g, b)) return false;
    const d = colorDist(r, g, b, keyR, keyG, keyB);
    if (d <= maxDist + blendDist) return true;
    if (isSpillGreen(r, g, b)) return true;
    return false;
  };

  for (let i = 0; i < n; i++) {
    if (keyScore(i)) isKey[i] = 1;
  }

  const visited = new Uint8Array(n);
  const queue = new Int32Array(n);
  let qh = 0;
  let qt = 0;

  const enqueue = (x: number, y: number) => {
    const i = y * width + x;
    if (visited[i] || !isKey[i]) return;
    visited[i] = 1;
    queue[qt++] = i;
  };

  for (let x = 0; x < width; x++) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (qh < qt) {
    const i = queue[qh++];
    const x = i % width;
    const y = (i / width) | 0;
    if (x > 0) enqueue(x - 1, y);
    if (x + 1 < width) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y + 1 < height) enqueue(x, y + 1);
    if (x > 0 && y > 0) enqueue(x - 1, y - 1);
    if (x + 1 < width && y > 0) enqueue(x + 1, y - 1);
    if (x > 0 && y + 1 < height) enqueue(x - 1, y + 1);
    if (x + 1 < width && y + 1 < height) enqueue(x + 1, y + 1);
  }

  // Expand edge-keyed mask into adjacent key greens (staff/fire pockets)
  let remove = visited;
  for (let pass = 0; pass < 3; pass++) {
    const next = new Uint8Array(remove);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        if (remove[i] || !isKey[i]) continue;
        if (
          remove[i - 1] ||
          remove[i + 1] ||
          remove[i - width] ||
          remove[i + width] ||
          remove[i - width - 1] ||
          remove[i - width + 1] ||
          remove[i + width - 1] ||
          remove[i + width + 1]
        ) {
          next[i] = 1;
        }
      }
    }
    remove = next;
  }

  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    if (isCharacterTone(r, g, b)) continue;

    // Always kill unmistakable greenscreen (covers holes not reached by flood)
    if (isPureScreenGreen(r, g, b)) {
      data[p + 3] = 0;
      continue;
    }

    if (!remove[i]) continue;

    const d = colorDist(r, g, b, keyR, keyG, keyB);
    if (d <= maxDist || isSpillGreen(r, g, b)) {
      data[p + 3] = 0;
    } else if (d < maxDist + blendDist) {
      const t = (d - maxDist) / blendDist;
      data[p + 3] = Math.round(data[p + 3] * Math.min(1, Math.max(0, t)));
    }
  }

  // Kill green stuck next to fire (staff flame halo) without touching blue outfit
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const p = i * 4;
      if (data[p + 3] < 8) continue;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      if (isCharacterTone(r, g, b) || isFireTone(r, g, b)) continue;
      if (!(g > r + 18 && g > b + 18 && g >= 100)) continue;

      const neigh = [
        i - 1,
        i + 1,
        i - width,
        i + width,
        i - width - 1,
        i - width + 1,
        i + width - 1,
        i + width + 1,
      ];
      let nearFire = false;
      let nearHole = false;
      for (const ni of neigh) {
        const np = ni * 4;
        if (data[np + 3] < 20) nearHole = true;
        if (isFireTone(data[np], data[np + 1], data[np + 2])) nearFire = true;
      }
      if (nearFire || (nearHole && isSpillGreen(r, g, b))) {
        data[p + 3] = 0;
      }
    }
  }

  // Despill only on fringe next to keyed holes — not whole outfit
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const p = i * 4;
      if (data[p + 3] < 8) continue;
      const r = data[p];
      let g = data[p + 1];
      const b = data[p + 2];
      if (isCharacterTone(r, g, b) || isFireTone(r, g, b)) continue;
      if (!(g > r + 12 && g > b + 12)) continue;

      const nearHole =
        data[p - 4 + 3] < 20 ||
        data[p + 4 + 3] < 20 ||
        data[p - width * 4 + 3] < 20 ||
        data[p + width * 4 + 3] < 20;
      if (!nearHole) continue;

      const cap = Math.max(r, b);
      data[p + 1] = Math.max(0, Math.min(255, Math.round(g + (cap - g) * despill)));
    }
  }
}

/**
 * Draw a video/image frame with clean green chroma key onto `ctx`.
 */
export function drawChromaKeyedFrame(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  offscreen: HTMLCanvasElement,
  opts?: ChromaKeyOpts,
): void {
  const maxKeyWidth = opts?.maxKeyWidth ?? 560;
  const scale = Math.min(1, maxKeyWidth / Math.max(1, sw));
  const w = Math.max(1, Math.floor(sw * scale));
  const h = Math.max(1, Math.floor(sh * scale));

  if (offscreen.width !== w || offscreen.height !== h) {
    offscreen.width = w;
    offscreen.height = h;
  }
  const octx = offscreen.getContext('2d', { willReadFrequently: true });
  if (!octx) {
    ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
    return;
  }
  octx.clearRect(0, 0, w, h);
  octx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
  const frame = octx.getImageData(0, 0, w, h);
  chromaKeyClean(
    frame,
    opts?.keyR ?? 25,
    opts?.keyG ?? 225,
    opts?.keyB ?? 13,
    opts?.similarity ?? 0.46,
    opts?.blend ?? 0.05,
    opts?.despill ?? 0.85,
  );
  octx.putImageData(frame, 0, 0);
  ctx.drawImage(offscreen, 0, 0, w, h, dx, dy, dw, dh);
}
