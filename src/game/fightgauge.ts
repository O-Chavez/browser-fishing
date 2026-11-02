// The reel gauge under the foundation's rules (REELING.md, "The gauge is the ladder" and "The foundation"), drawn by
// the game while reeling and by the gauge lab. Ported from the lab as Oscar played it (2026-11-02), with the FIGHT bar
// above the gauge, clear of the ring round it; its details and words are a draft, to settle with mockups when the
// gauge is finished (TODO: the reel fight's tier ladder, step 6).
import { GOOD_MAX, type Reel } from './reel';

const A0 = Math.PI * 0.75;
const SWEEP = Math.PI * 1.5;
const GREEN = [88, 224, 122];
const BLUE = [90, 150, 215];
const AMBER = [255, 176, 32];
/** The HUD's font (`style.css`), so the gauge's words match the rest of the screen. */
const FONT = 'Nunito, ui-rounded, system-ui, sans-serif';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const mix = (a: number[], b: number[], k: number, alpha = 1) => `rgba(${a.map((x, i) => Math.round(x + (b[i] - x) * k)).join(',')},${alpha})`;

/** What the fight looks like this frame, besides the reel: the button and how long ago the last fray mark filled. */
export interface GaugeView {
  holding: boolean;
  /** Seconds left of the flash after a fray mark fills (0 once it's over). */
  frayFlash: number;
}

/**
 * Draws the gauge round (cx, cy), in the game's gauge units (radius 96): blue below the weight threshold (holding
 * there in a surge loses line), one flat green above it (winning line), the red with a strip along its inside half,
 * green where holding there still wins line and blue where it loses it, and the fish's pull as a black line (an
 * arrowhead past the end when it pulls beyond the gauge). The line ring inside turns amber while the fish takes line, the fray marks
 * sit by the red, the FIGHT bar above and the words below. Returns whether a fray mark is about to fill, for the
 * screen's shake and vignette.
 */
export function drawFightGauge(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: Reel, time: number, view: GaugeView): boolean {
  const { holding, frayFlash } = view;
  const R = 96;
  const LW = 15;
  const arc = (rad: number, from: number, to: number, color: string, lw: number, cap: CanvasLineCap = 'butt') => {
    if (to <= from) return;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, A0 + from * SWEEP, A0 + to * SWEEP);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = cap;
    ctx.stroke();
  };
  const surge = r.surging;
  const warn = r.warning;
  const thr = clamp01(r.threshold);
  const peak = r.surgePulls[1];
  const bright = surge ? 1 : warn ? 0.85 : 0.6;
  const partial = clamp01(r.strain * 2 - r.wear.frays);
  const nearFray = r.fraying && partial > 0.7;
  const giving = r.lineRate < -0.001;
  const pulse = 0.5 + 0.5 * Math.sin(time * (nearFray ? 18 : 8));

  if (nearFray || surge || warn) {
    ctx.beginPath();
    // The ring's inside edge stays just clear of the fray marks; its pulse grows outward, short of the FIGHT bar.
    const lw = nearFray ? 10 + 8 * pulse : 5;
    ctx.arc(cx, cy, 118 + lw / 2, 0, Math.PI * 2);
    ctx.strokeStyle = nearFray ? `rgba(255,59,48,${0.25 + 0.55 * pulse})` : `rgba(255,176,32,${0.15 + 0.25 * pulse})`;
    ctx.lineWidth = lw;
    ctx.stroke();
  }

  arc(R, 0, 1, 'rgba(0,0,0,0.5)', LW + 5, 'round');
  // Blue below the threshold, one flat green above it (holding there wins line as fast anywhere), to the gauge's end.
  arc(R, 0.004, Math.min(thr, 0.996), mix(BLUE, BLUE, 0, 0.8 * bright + 0.1), LW);
  arc(R, thr, 0.996, mix(GREEN, GREEN, 0, 0.85 * bright + 0.1), LW);
  // The red frays the line: it takes the outside half of the band, so the inside half still says whether holding
  // there wins line (green) or loses it (blue). It replaced green/blue hatching across the whole red (Oscar,
  // 2026-11-03), so the green reads clearly. Cut out, not painted over, so no red shows at the edges of the green.
  const hr = R + LW / 4;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  arc(hr, GOOD_MAX, 0.996, '#000', LW / 2);
  ctx.restore();
  arc(hr, GOOD_MAX, 0.996, 'rgba(0,0,0,0.5)', LW / 2);
  arc(hr, GOOD_MAX, 0.996, `rgba(225,50,40,${0.75 * bright + 0.2})`, LW / 2);
  // Strain building: the red glows, on its own half, so the inside half still reads.
  if (r.fraying) {
    ctx.save();
    ctx.shadowColor = '#ff5a30';
    ctx.shadowBlur = 8 + 18 * partial;
    arc(hr, GOOD_MAX, 0.996, `rgba(255,90,48,${0.2 + 0.5 * partial})`, LW / 2);
    ctx.restore();
  }

  const radial = (v: number, r0: number, r1: number, color: string, lw: number) => {
    const a = A0 + v * SWEEP;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'butt';
    ctx.stroke();
  };
  // In a surge, the pull as it builds: a white tick climbing to the black line.
  if (surge && r.need > 0.02) radial(Math.min(1, r.need), R - LW / 2, R + LW / 2, 'rgba(255,255,255,0.9)', 2.5);
  // The fish's pull at full build-up: a black line, from the hook.
  if (peak > 0) {
    const v = Math.min(1, peak);
    radial(v, R - LW / 2 - 6, R + LW / 2 + 6, '#fff', 7);
    radial(v, R - LW / 2 - 5, R + LW / 2 + 5, '#111', 4);
    if (peak > 1) {
      // Past the end: an arrowhead beyond the gauge.
      const a = A0 + SWEEP + 0.07, b = A0 + SWEEP;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.lineTo(cx + Math.cos(b) * (R - 11), cy + Math.sin(b) * (R - 11));
      ctx.lineTo(cx + Math.cos(b) * (R + 11), cy + Math.sin(b) * (R + 11));
      ctx.closePath();
      ctx.fillStyle = '#111';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
    }
  }

  // Fray marks by the red: amber while filling, red once frayed.
  const blink = 0.5 + 0.5 * Math.sin(time * 24);
  ([[0.8, 0.895], [0.905, 1]] as [number, number][]).forEach(([from, to], i) => {
    const mr = R + LW / 2 + 7;
    arc(mr, from, to, 'rgba(0,0,0,0.55)', 11);
    if (i < r.wear.frays) arc(mr, from, to, frayFlash > 0 && i === r.wear.frays - 1 && blink > 0.5 ? '#fff' : '#ff3b30', 8);
    else if (i === r.wear.frays && partial > 0) arc(mr, from, from + (to - from) * partial, mix([255, 205, 70], [255, 70, 40], partial, r.fraying ? 0.65 + 0.35 * blink : 0.85), 8);
  });

  // Line won: blue, turning amber and pulsing while the fish takes line.
  arc(72, 0, 1, 'rgba(0,0,0,0.45)', 9, 'round');
  arc(72, 0, Math.max(0.01, r.progress), giving ? mix(AMBER, [255, 120, 40], pulse) : '#58b6ff', giving ? 8 + 2 * pulse : 7, 'round');

  // The dot: tension.
  const na = A0 + Math.min(1, r.tension) * SWEEP;
  ctx.beginPath();
  ctx.arc(cx + Math.cos(na) * R, cy + Math.sin(na) * R, 9 + (nearFray ? 3 * pulse : 0), 0, Math.PI * 2);
  ctx.fillStyle = r.tension > GOOD_MAX ? '#ffd0c8' : '#fff';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 6;
  ctx.fill();

  ctx.textAlign = 'center';
  // Fight left, above the gauge: drains while it surges against a held line, glowing as it does; yellow once it's
  // tired, empty once it's exhausted. The label stays FIGHT throughout, so "tired" can't read as the player (Oscar, 2026-11-01).
  const bw = 132, bh = 8, bx = cx - bw / 2, by = cy - 152;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.roundRect(bx - 2, by - 2, bw + 4, bh + 4, 6);
  ctx.fill();
  if (r.fightLeft > 0) {
    const colour = r.tired ? '#ffd23a' : '#ff9a3c';
    ctx.fillStyle = colour;
    if (r.tiring) {
      ctx.shadowColor = colour;
      ctx.shadowBlur = 8 + 4 * pulse;
    }
    ctx.beginPath();
    ctx.roundRect(bx, by, Math.max(bh, bw * r.fightLeft), bh, 4);
    ctx.fill();
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 6;
  }
  ctx.font = `800 12px ${FONT}`;
  ctx.fillStyle = '#fff';
  ctx.fillText('FIGHT', cx, by - 7);

  // Words (the lab's draft).
  let big: string, color: string, small = '';
  if (r.status !== 'reeling') [big, color] = r.status === 'caught' ? ['LANDED!', '#7dff8a'] : r.status === 'snapped' ? ['SNAP!', '#ff3b30'] : ['RAN OFF!', '#ffb020'];
  else if (frayFlash > 0) [big, color, small] = ['FRAYED', '#ff3b30', r.wear.frays >= 1 ? 'One more fray snaps the line' : ''];
  else if (nearFray) [big, color, small] = ['EASE OFF!', '#ff3b30', 'About to fray'];
  else if (holding && r.tension > GOOD_MAX) [big, color, small] = ['PUSHING', '#ffb020', r.tension >= thr ? 'Winning line, straining the line' : 'Straining the line, still losing line'];
  else if (surge && !holding) [big, color, small] = ['GIVING LINE', '#ffb020', 'Letting go lets it run'];
  else if (surge && r.tension < thr) [big, color, small] = ['RIDE HIGHER', '#8fc0ff', 'In the blue it takes line'];
  else if (surge) [big, color, small] = ['WINNING LINE', '#7dff8a', ''];
  else if (warn) [big, color, small] = ['SURGE!', '#ffb020', peak > 1 ? 'It pulls past the end' : peak > GOOD_MAX ? 'It pulls into the red' : ''];
  else if (r.exhausted) [big, color, small] = ['REEL IT IN!', '#7dff8a', 'The fish has no fight left'];
  else {
    [big, color] = holding ? ['REELING', '#7dff8a'] : ['HOLD TO REEL', '#7dff8a'];
    small = peak > 1 ? 'Too strong for your line' : thr >= GOOD_MAX ? 'Too heavy for your rod' : holding ? '' : 'Slack line: it swims off';
  }
  ctx.fillStyle = color;
  ctx.font = `800 ${nearFray ? 30 + 4 * pulse : 26}px ${FONT}`;
  ctx.fillText(big, cx, cy + 146);
  ctx.font = `700 13px ${FONT}`;
  ctx.fillStyle = '#fff';
  if (small) ctx.fillText(small, cx, cy + 168);
  ctx.shadowBlur = 0;
  return nearFray;
}
