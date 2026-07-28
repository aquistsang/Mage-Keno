export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  color: string;
  life: number;
  maxLife: number;
};

const HIT_COLORS = ['#ffe566', '#ff9a1a', '#ff4d2e', '#fff1a8', '#ff6b00'];

/** Spawn a burst of fragments at an impact point. */
export function spawnExplosion(x: number, y: number, count = 28): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const speed = 2.2 + Math.random() * 4.8;
    const life = 320 + Math.random() * 280;
    out.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.2,
      radius: 1.5 + Math.random() * 3.2,
      alpha: 1,
      color: HIT_COLORS[i % HIT_COLORS.length],
      life,
      maxLife: life,
    });
  }
  return out;
}

/** Advance particles by dt ms. Mutates array in place; removes dead ones. */
export function updateParticles(particles: Particle[], dt: number): void {
  const drag = 0.985;
  const gravity = 0.08 * (dt / 16);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.vx *= drag;
    p.vy = p.vy * drag + gravity;
    p.x += p.vx * (dt / 16);
    p.y += p.vy * (dt / 16);
    p.alpha = Math.max(0, p.life / p.maxLife);
    p.radius *= 0.995;
  }
}

export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
  for (const p of particles) {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.4, p.radius), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
