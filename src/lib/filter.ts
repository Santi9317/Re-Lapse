import { disposableDate } from "@/lib/format";

const WIDTH = 900;
const HEIGHT = 1125;

const LOOK = {
  blackLift: 0.11,
  contrast: 0.7,
  saturation: 0.58,
  warmR: 1.18,
  warmG: 1.05,
  warmB: 0.68,
  greenShadow: 0.12,
  grain: 36,
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
  soft.width = Math.round(WIDTH / 2);
  soft.height = Math.round(HEIGHT / 2);
  const softCtx = soft.getContext("2d");
  if (softCtx) {
    softCtx.drawImage(canvas, 0, 0, soft.width, soft.height);
    ctx.globalAlpha = 0.34;
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
      const ir = (y * WIDTH + Math.max(0, x - 2)) * 4;
      let r = fade((s[ir] ?? 0) / 255);
      let g = fade((s[i + 1] ?? 0) / 255);
      let b = fade((s[i + 2] ?? 0) / 255);
      const luma = r * 0.3 + g * 0.59 + b * 0.11;
      r = luma + (r - luma) * LOOK.saturation;
      g = luma + (g - luma) * LOOK.saturation;
      b = luma + (b - luma) * LOOK.saturation;
      const shadow = Math.max(0, 0.5 - luma);
      r = r * LOOK.warmR + 0.035;
      g = g * LOOK.warmG + shadow * LOOK.greenShadow + 0.02;
      b = b * LOOK.warmB + 0.012;

      const nx = (x + 0.5) / WIDTH - 0.5;
      const ny = (y + 0.5) / HEIGHT - 0.38;
      const dist = Math.hypot(nx * 1.12, ny);
      const flash = Math.max(0, 1 - dist / 0.46);
      r += flash * 0.2;
      g += flash * 0.14;
      b += flash * 0.05;
      const edge = Math.min(1, Math.max(0, (dist - 0.16) / 0.7));
      const vig = edge * edge;
      r = r * (1 - vig * 0.82) + vig * 0.045;
      g = g * (1 - vig * 0.84) + vig * 0.028;
      b = b * (1 - vig * 0.9) + vig * 0.016;

      const grain = (Math.random() - 0.5) * (LOOK.grain / 255) * (0.75 + (1 - luma) * 0.85);
      o[i] = (r + grain) * 255;
      o[i + 1] = (g + grain) * 255;
      o[i + 2] = (b + grain * 0.8) * 255;
      o[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);

  ctx.fillStyle = "rgba(255, 176, 96, 0.12)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const leak = ctx.createLinearGradient(WIDTH * 0.58, 0, WIDTH, HEIGHT * 0.62);
  leak.addColorStop(0, "rgba(255, 50, 0, 0)");
  leak.addColorStop(0.45, "rgba(255, 70, 10, 0.18)");
  leak.addColorStop(1, "rgba(255, 30, 0, 0.82)");
  ctx.fillStyle = leak;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const green = ctx.createRadialGradient(WIDTH * 0.02, HEIGHT * 0.78, 8, WIDTH * 0.08, HEIGHT * 0.82, WIDTH * 0.62);
  green.addColorStop(0, "rgba(150, 255, 90, 0.55)");
  green.addColorStop(1, "rgba(150, 255, 90, 0)");
  ctx.fillStyle = green;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.45;
  for (let n = 0; n < 30; n++) {
    const x = Math.random() * WIDTH;
    const y = Math.random() * HEIGHT;
    ctx.fillStyle = Math.random() > 0.45 ? "rgba(40, 24, 16, 0.85)" : "rgba(255, 236, 210, 0.8)";
    ctx.beginPath();
    ctx.arc(x, y, Math.random() * 1.7 + 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = "rgba(255, 244, 220, 0.8)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(WIDTH * 0.18, HEIGHT * 0.04);
  ctx.lineTo(WIDTH * 0.22, HEIGHT * 0.96);
  ctx.stroke();
  ctx.restore();

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
