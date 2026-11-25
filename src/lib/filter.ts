import { gradeFrame, type GradeOptions } from "@/lib/disposable";
import type { Chemistry } from "@/lib/types";

const WIDTH = 900;
const HEIGHT = 1125;

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

function frameCanvas(source: ImageBitmap): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not open the darkroom.");
  ctx.fillStyle = "#d7d0c6";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.imageSmoothingEnabled = true;
  drawCover(ctx, source, source.width, source.height, WIDTH, HEIGHT);
  return canvas;
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

async function finishJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const blob = await canvasToJpeg(canvas, quality);
  if (blob.size > 900_000) return canvasToJpeg(canvas, 0.72);
  return blob;
}

/** The 900×1125 cover, before a bath. Personal frames wait in this state. */
export async function renderLatent(source: ImageBitmap): Promise<Blob> {
  return finishJpeg(frameCanvas(source), 0.92);
}

export async function renderDisposable(
  source: ImageBitmap,
  options: { dateStamp: boolean; date?: Date; chemistry?: Chemistry; seed?: string },
): Promise<Blob> {
  const canvas = frameCanvas(source);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not open the darkroom.");
  const frame = ctx.getImageData(0, 0, WIDTH, HEIGHT);
  const grade: GradeOptions = {
    chemistry: options.chemistry ?? "default",
    seed: options.seed,
    date: options.dateStamp ? (options.date ?? null) : null,
  };
  frame.data.set(gradeFrame(frame.data, WIDTH, HEIGHT, grade));
  ctx.putImageData(frame, 0, 0);
  return finishJpeg(canvas, 0.93);
}
