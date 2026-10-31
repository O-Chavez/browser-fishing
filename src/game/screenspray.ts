import { screenSprayAt } from '../data/sea';

/**
 * Spray on the screen at sea: when the bow slams into a wave, droplets land on the view and a misty
 * flash washes over it. From about depth 30 (`screenSprayAt`), more often and heavier the deeper the
 * dive, so the waves feel more treacherous. A plain 2D canvas over the 3D view at half resolution,
 * drawn only while something is on it.
 */

interface Drop {
  x: number;
  y: number;
  r: number;
  /** Seconds left, and the total it started with. */
  life: number;
  max: number;
  /** Slide speed down the screen, in canvas pixels a second. */
  vy: number;
}

/** Render scale against the CSS size: the drops are soft, so half resolution looks the same. */
const SCALE = 0.5;
/** The bow has to drop at least this fast (m/s) to throw spray over the rail: about 2 waves a minute at depth 30, 6 at 80, 11 in the Abyss. */
const SLAM = 0.35;

export class ScreenSpray {
  private cv = document.getElementById('spray') as HTMLCanvasElement;
  private g = this.cv.getContext('2d')!;
  private drops: Drop[] = [];
  private mist = 0;
  private cool = 0;
  private dirty = false;

  /** `mood`: the sea's (0 off the sea), `slam`: the bow's sink speed, `night`: 0..1 dims the spray. */
  update(dt: number, mood: number, slam: number, night: number): void {
    const k = screenSprayAt(mood);
    if (k <= 0 && !this.dirty) return;
    this.cool -= dt;
    if (k > 0 && slam > SLAM && this.cool <= 0) {
      this.burst(k);
      this.cool = 1.6 - 0.9 * k;
    }
    // A stray drop now and then between slams.
    // In the deepest storms it never really stops.
    if (k > 0 && Math.random() < dt * (1.5 + 10 * k * k) * k) this.add(1);
    this.mist *= Math.exp(-1.6 * dt);
    for (const d of this.drops) {
      d.life -= dt;
      d.y += d.vy * dt;
      d.vy += 12 * dt;
    }
    this.drops = this.drops.filter((d) => d.life > 0);
    this.draw(night);
  }

  /** One wave over the bow, at strength `k` (0..1): a patch of drops where it hits, a few strays, and mist. */
  burst(k: number): void {
    this.mist = Math.min(0.65, this.mist + 0.2 + 0.35 * k);
    this.resize();
    const { width: w, height: h } = this.cv;
    // The wave hits from a side or the top.
    const side = Math.random();
    const cx = side < 0.4 ? w * (0.05 + Math.random() * 0.2) : side < 0.8 ? w * (0.75 + Math.random() * 0.2) : w * (0.3 + Math.random() * 0.4);
    const cy = h * (0.1 + Math.random() * 0.45);
    const spread = Math.min(w, h) * (0.18 + 0.2 * k);
    const n = Math.round(14 + 40 * k);
    for (let i = 0; i < n; i++) {
      // Roughly gaussian around the hit.
      const g = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
      this.drop(cx + g() * spread * 1.4, cy + g() * spread);
    }
    this.add(Math.round(2 + 6 * k));
  }

  private add(n: number): void {
    this.resize();
    for (let i = 0; i < n; i++) this.drop(Math.random() * this.cv.width, Math.random() * this.cv.height * 0.85);
  }

  private drop(x: number, y: number): void {
    const h = this.cv.height;
    const max = 1.2 + Math.random() * 1.8;
    // Mostly small beads, a few big ones; the big ones run down the glass.
    const big = Math.pow(Math.random(), 3);
    this.drops.push({ x, y, r: (2.5 + big * 16) * (h / 450), life: max, max, vy: big > 0.3 ? 10 + Math.random() * 25 : Math.random() * 4 });
    if (this.drops.length > 160) this.drops.splice(0, this.drops.length - 160);
  }

  private resize(): void {
    const w = Math.max(1, Math.round(this.cv.clientWidth * SCALE));
    const h = Math.max(1, Math.round(this.cv.clientHeight * SCALE));
    if (this.cv.width !== w || this.cv.height !== h) {
      this.cv.width = w;
      this.cv.height = h;
    }
  }

  private draw(night: number): void {
    const g = this.g;
    const { width: w, height: h } = this.cv;
    g.clearRect(0, 0, w, h);
    // Dimmer at night, but never grey: grey drops look like dirt on the screen.
    const lit = Math.round(255 * (1 - 0.3 * night));
    const c = (a: number) => `rgba(${lit}, ${lit}, ${Math.min(255, lit + 8)}, ${a.toFixed(3)})`;
    if (this.mist > 0.01) {
      const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
      v.addColorStop(0, c(this.mist * 0.15));
      v.addColorStop(1, c(this.mist));
      g.fillStyle = v;
      g.fillRect(0, 0, w, h);
    }
    for (const d of this.drops) {
      const a = Math.min(1, d.life / 0.6, (d.max - d.life) / 0.08 + 0.2);
      // A soft bead, a little longer as it runs, with a glint up and to the left.
      const stretch = 1 + Math.min(0.8, d.vy / 40);
      g.save();
      g.translate(d.x, d.y);
      g.scale(1, stretch);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, d.r);
      gr.addColorStop(0, c(0.3 * a));
      gr.addColorStop(0.6, c(0.2 * a));
      gr.addColorStop(1, c(0));
      g.fillStyle = gr;
      g.beginPath();
      g.arc(0, 0, d.r, 0, Math.PI * 2);
      g.fill();
      if (d.r > 4) {
        g.fillStyle = c(0.55 * a);
        g.beginPath();
        g.arc(-d.r * 0.3, -d.r * 0.3, d.r * 0.18, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
    this.dirty = this.mist > 0.01 || this.drops.length > 0;
  }
}
