import { disposableDate } from "@/lib/format";

const WIDTH = 900;
const HEIGHT = 1125;

/**
 * A mild disposable grade, in the range of the published Lapse recipe:
 * a small exposure lift, flattened contrast, softer highlights, lifted
 * shadows and matte blacks, a little amber and magenta, fine-medium grain,
 * and a light corner falloff. No light leaks or heavy blur.
 */
const LOOK = {
  exposure: 2 ** 0.12,
  contrast: 0.84,
  highlightPull: 0.09,
  shadowLift: 0.025,
  blackFloor: 0.022,
  warm: 0.12,
  magenta: 0.06,
  vibrance: 0.1,
  saturation: 0.95,
  soften: 0.08,
  grain: 28,
  vignette: 0.13,
};

function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
) {
  const scale = Math.max(dw / sw, dh / sh);
  const w = sw * scale;
  const h = sh * scale;
  ctx.drawImage(source, (dw - w) / 2, (dh - h) / 2, w, h);
}

function drawStamp(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  ctx.save();
  ctx.font = "600 40px \"IBM Plex Mono\", ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = color;
  const gap = 3;
  let cursor = x;
  for (const char of [...text].reverse()) {
    ctx.fillText(char, cursor, y);
    cursor -= ctx.measureText(char).width + gap;
  }
  ctx.restore();
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function tone(value: number): number {
  let v = Math.min(1.2, value * LOOK.exposure);
  v = (v - 0.5) * LOOK.contrast + 0.5;
  if (v > 0.58) {
    const t = (v - 0.58) / 0.42;
    v -= t * t * LOOK.highlightPull;
  } else if (v < 0.42) {
    const t = (0.42 - v) / 0.42;
    v += t * t * LOOK.shadowLift;
  }
  return clamp01(v * (1 - LOOK.blackFloor) + LOOK.blackFloor);
}

function gradeColor(r: number, g: number, b: number): [number, number, number] {
  const warm = LOOK.warm;
  r *= 1 + warm * 0.35;
  g *= 1 + warm * 0.08;
  b *= 1 - warm * 0.42;
  const tint = LOOK.magenta;
  r *= 1 + tint * 0.15;
  g *= 1 - tint * 0.22;
  b *= 1 + tint * 0.12;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max <= 0 ? 0 : (max - min) / max;
  const luma = r * 0.299 + g * 0.587 + b * 0.114;
  const factor = (1 + (1 - chroma) * LOOK.vibrance) * LOOK.saturation;
  return [
    clamp01(luma + (r - luma) * factor),
    clamp01(luma + (g - luma) * factor),
    clamp01(luma + (b - luma) * factor),
  ];
}

export async function renderDisposable(
  source: ImageBitmap,
  options: { dateStamp: boolean; date?: Date },
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not open the darkroom.");

  ctx.fillStyle = "#d7d0c6";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawCover(ctx, source, source.width, source.height, WIDTH, HEIGHT);

  const soft = document.createElement("canvas");
  soft.width = Math.round(WIDTH * 0.9);
  soft.height = Math.round(HEIGHT * 0.9);
  const softCtx = soft.getContext("2d");
  if (softCtx) {
    softCtx.imageSmoothingEnabled = true;
    softCtx.drawImage(canvas, 0, 0, soft.width, soft.height);
    ctx.globalAlpha = LOOK.soften;
    ctx.drawImage(soft, 0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = 1;
  }

  const src = ctx.getImageData(0, 0, WIDTH, HEIGHT);
  const out = ctx.createImageData(WIDTH, HEIGHT);
  const s = src.data;
  const o = out.data;
  const grainW = Math.ceil(WIDTH / 2);
  const grainH = Math.ceil(HEIGHT / 2);
  const grainMap = new Float32Array(grainW * grainH);
  const grainAmp = LOOK.grain / 255;
  for (let i = 0; i < grainMap.length; i++) grainMap[i] = (Math.random() - 0.5) * grainAmp;

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = (y * WIDTH + x) * 4;
      let [r, g, b] = gradeColor(
        tone((s[i] ?? 0) / 255),
        tone((s[i + 1] ?? 0) / 255),
        tone((s[i + 2] ?? 0) / 255),
      );
      const luma = r * 0.299 + g * 0.587 + b * 0.114;
      const nx = (x + 0.5) / WIDTH - 0.5;
      const ny = (y + 0.5) / HEIGHT - 0.5;
      const dist = Math.hypot(nx * 1.05, ny * 0.92);
      const edge = Math.min(1, Math.max(0, (dist - 0.28) / 0.42));
      const falloff = 1 - edge * edge * LOOK.vignette;
      r *= falloff;
      g *= falloff;
      b *= falloff;
      const grain = (grainMap[(y >> 1) * grainW + (x >> 1)] ?? 0) * (0.9 + (1 - luma) * 0.2);
      o[i] = (r + grain) * 255;
      o[i + 1] = (g + grain) * 255;
      o[i + 2] = (b + grain * 0.85) * 255;
      o[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);

  if (options.dateStamp) {
    if (document.fonts?.load) {
      await document.fonts.load("600 40px \"IBM Plex Mono\"").catch(() => undefined);
    }
    const stamp = disposableDate(options.date ?? new Date());
    drawStamp(ctx, stamp, WIDTH - 34, HEIGHT - 36, "rgba(50, 16, 0, 0.55)");
    drawStamp(ctx, stamp, WIDTH - 36, HEIGHT - 38, "#ff5714");
  }

  const blob = await canvasToJpeg(canvas, 0.86);
  if (blob.size > 900_000) return canvasToJpeg(canvas, 0.72);
  return blob;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not finish the print."))),
      "image/jpeg",
      quality,
    );
  });
}
