/**
 * Standby grade, measured from the sample prints and checked on one portrait.
 * It is not the look the camera prints. `GRADE` in filter.ts stays on "lapse"
 * until that switch is asked for.
 *
 * Exposure +0.08, contrast about -8, a small highlight roll-off and shadow
 * lift, blacks near 18, warmth +6 with a little green in the shadows,
 * saturation -10, vibrance +8, a 5% soften, fine 1px grain, and a light vignette.
 */
const LOOK = {
  exposure: 2 ** 0.08,
  contrast: 0.92,
  soften: 0.05,
  grain: 18,
  vignette: 0.1,
  warm: 0.06,
  vibrance: 0.08,
  saturation: 0.9,
};

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function tone(value: number): number {
  let v = Math.min(1.12, value * LOOK.exposure);
  v = (v - 0.5) * LOOK.contrast + 0.5;
  if (v > 0.7) {
    const t = (v - 0.7) / 0.3;
    v -= t * t * 0.04;
  } else if (v < 0.33) {
    const t = (0.33 - v) / 0.33;
    v += t * t * 0.025;
  }
  return clamp01(v * 0.99 + 0.012);
}

function gradeColor(r: number, g: number, b: number): [number, number, number] {
  const warm = LOOK.warm;
  r *= 1 + warm * 0.25;
  g *= 1 + warm * 0.08;
  b *= 1 - warm * 0.28;
  let luma = r * 0.299 + g * 0.587 + b * 0.114;
  const shadow = Math.max(0, 0.42 - luma) / 0.42;
  r -= shadow * 0.012;
  g += shadow * 0.02;
  b -= shadow * 0.008;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max <= 0 ? 0 : (max - min) / max;
  luma = r * 0.299 + g * 0.587 + b * 0.114;
  const factor = (1 + (1 - chroma) * LOOK.vibrance) * LOOK.saturation;
  return [
    clamp01(luma + (r - luma) * factor),
    clamp01(luma + (g - luma) * factor),
    clamp01(luma + (b - luma) * factor),
  ];
}

/** Replace the canvas image with the standby grade. The date stamp is applied after this. */
export function applyReferenceGrade(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const soft = document.createElement("canvas");
  soft.width = Math.max(1, Math.round(width * 0.94));
  soft.height = Math.max(1, Math.round(height * 0.94));
  const softCtx = soft.getContext("2d");
  if (softCtx) {
    softCtx.imageSmoothingEnabled = true;
    softCtx.drawImage(ctx.canvas, 0, 0, soft.width, soft.height);
    ctx.globalAlpha = LOOK.soften;
    ctx.drawImage(soft, 0, 0, width, height);
    ctx.globalAlpha = 1;
  }

  const src = ctx.getImageData(0, 0, width, height);
  const out = ctx.createImageData(width, height);
  const s = src.data;
  const o = out.data;
  const grainAmp = LOOK.grain / 255;
  const grain = new Float32Array(width * height);
  for (let i = 0; i < grain.length; i++) grain[i] = (Math.random() - 0.5) * grainAmp;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let [r, g, b] = gradeColor(
        tone((s[i] ?? 0) / 255),
        tone((s[i + 1] ?? 0) / 255),
        tone((s[i + 2] ?? 0) / 255),
      );
      const luma = r * 0.299 + g * 0.587 + b * 0.114;
      const nx = (x + 0.5) / width - 0.5;
      const ny = (y + 0.5) / height - 0.5;
      const dist = Math.hypot(nx * 1.05, ny * 0.92);
      const edge = Math.min(1, Math.max(0, (dist - 0.34) / 0.42));
      const falloff = 1 - edge * edge * LOOK.vignette;
      r *= falloff;
      g *= falloff;
      b *= falloff;
      const n = (grain[y * width + x] ?? 0) * (0.85 + (1 - luma) * 0.35);
      o[i] = (r + n) * 255;
      o[i + 1] = (g + n * 0.95) * 255;
      o[i + 2] = (b + n * 0.9) * 255;
      o[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
}
