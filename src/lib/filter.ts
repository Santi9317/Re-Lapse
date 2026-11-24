import { disposableDate } from "@/lib/format";

const WIDTH = 900;
const HEIGHT = 1125;

/** A light disposable print: a little warmth, fine grain, soft corners. */
const LOOK = {
  blackLift: 0.03,
  contrast: 0.96,
  saturation: 0.92,
  warmR: 1.045,
  warmG: 1.012,
  warmB: 0.95,
  grain: 11,
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

export async function renderDisposable(
  source: ImageBitmap,
  options: { dateStamp: boolean; date?: Date },
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not open the darkroom.");

  ctx.fillStyle = "#cbb89a";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawCover(ctx, source, source.width, source.height, WIDTH, HEIGHT);

  const soft = document.createElement("canvas");
  soft.width = Math.round(WIDTH * 0.72);
  soft.height = Math.round(HEIGHT * 0.72);
  const softCtx = soft.getContext("2d");
  if (softCtx) {
    softCtx.drawImage(canvas, 0, 0, soft.width, soft.height);
    ctx.globalAlpha = 0.12;
    ctx.drawImage(soft, 0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = 1;
  }

  const src = ctx.getImageData(0, 0, WIDTH, HEIGHT);
  const out = ctx.createImageData(WIDTH, HEIGHT);
  const s = src.data;
  const o = out.data;
  const fade = (value: number) => {
    const lifted = value * (1 - LOOK.blackLift) + LOOK.blackLift;
    return (lifted - 0.5) * LOOK.contrast + 0.5;
  };

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = (y * WIDTH + x) * 4;
      let r = fade((s[i] ?? 0) / 255);
      let g = fade((s[i + 1] ?? 0) / 255);
      let b = fade((s[i + 2] ?? 0) / 255);
      const luma = r * 0.3 + g * 0.59 + b * 0.11;
      r = luma + (r - luma) * LOOK.saturation;
      g = luma + (g - luma) * LOOK.saturation;
      b = luma + (b - luma) * LOOK.saturation;
      r = r * LOOK.warmR + 0.012;
      g = g * LOOK.warmG + 0.006;
      b = b * LOOK.warmB;

      const nx = (x + 0.5) / WIDTH - 0.5;
      const ny = (y + 0.5) / HEIGHT - 0.5;
      const dist = Math.hypot(nx * 0.92, ny);
      const flash = Math.max(0, 1 - dist / 0.85);
      r += flash * 0.035;
      g += flash * 0.025;
      b += flash * 0.01;
      const edge = Math.min(1, Math.max(0, (dist - 0.48) / 0.62));
      const vig = edge * edge;
      const falloff = 1 - vig * 0.22;
      r *= falloff;
      g *= falloff;
      b *= falloff;

      const grain = (Math.random() - 0.5) * (LOOK.grain / 255) * (0.85 + (1 - luma) * 0.25);
      o[i] = (r + grain) * 255;
      o[i + 1] = (g + grain) * 255;
      o[i + 2] = (b + grain * 0.8) * 255;
      o[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);

  ctx.fillStyle = "rgba(255, 186, 120, 0.035)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  if (options.dateStamp) {
    if (document.fonts?.load) {
      await document.fonts.load("600 40px \"IBM Plex Mono\"").catch(() => undefined);
    }
    const stamp = disposableDate(options.date ?? new Date());
    drawStamp(ctx, stamp, WIDTH - 34, HEIGHT - 36, "rgba(50, 16, 0, 0.55)");
    drawStamp(ctx, stamp, WIDTH - 36, HEIGHT - 38, "#ff5714");
  }

  const blob = await canvasToJpeg(canvas, 0.82);
  if (blob.size > 900_000) return canvasToJpeg(canvas, 0.66);
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
