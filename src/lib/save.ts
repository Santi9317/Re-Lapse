import { photoHeaders } from "@/lib/api";

const files = new Map<string, File>();
const pending = new Map<string, Promise<File>>();
const recent: string[] = [];
const MAX_FILES = 6;
const FILE_NAME = "Re-Lapse.jpg";

function remember(id: string, file: File) {
  files.set(id, file);
  const index = recent.indexOf(id);
  if (index >= 0) recent.splice(index, 1);
  recent.push(id);
  while (recent.length > MAX_FILES) {
    const old = recent.shift();
    if (old) files.delete(old);
  }
}

async function fetchPhotoFile(id: string): Promise<File> {
  const response = await fetch(`/api/photos/${id}/image`, {
    headers: photoHeaders(),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("That frame is already gone.");
  const blob = await response.blob();
  const jpeg = blob.type === "image/jpeg" ? blob : new Blob([blob], { type: "image/jpeg" });
  return new File([jpeg], FILE_NAME, { type: "image/jpeg" });
}

export function rememberPhotoBlob(id: string, blob: Blob) {
  const jpeg = blob.type === "image/jpeg" ? blob : new Blob([blob], { type: "image/jpeg" });
  remember(id, new File([jpeg], FILE_NAME, { type: "image/jpeg" }));
}

export function warmPhoto(id: string) {
  if (files.has(id) || pending.has(id)) return;
  const task = fetchPhotoFile(id)
    .then((file) => {
      remember(id, file);
      return file;
    })
    .finally(() => {
      pending.delete(id);
    });
  pending.set(id, task);
  void task.catch(() => undefined);
}

export function readyPhotoFile(id: string): File | null {
  return files.get(id) ?? null;
}

export function ensurePhotoFile(id: string): Promise<File> {
  const ready = files.get(id);
  if (ready) return Promise.resolve(ready);
  const inflight = pending.get(id);
  if (inflight) return inflight;
  warmPhoto(id);
  const next = pending.get(id);
  if (!next) return Promise.reject(new Error("That frame didn't download."));
  return next;
}

export function fileFromImage(image: HTMLImageElement | null): File | null {
  if (!image?.complete || image.naturalWidth === 0 || image.naturalHeight === 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  try {
    ctx.drawImage(image, 0, 0);
  } catch {
    return null;
  }
  const url = canvas.toDataURL("image/jpeg", 0.92);
  const comma = url.indexOf(",");
  if (comma < 0) return null;
  const binary = atob(url.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], FILE_NAME, { type: "image/jpeg" });
}

export function iosPhotosTarget(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function canShareFile(file: File): boolean {
  return (
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  );
}

function saveFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name || FILE_NAME;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function shareErrorName(error: unknown): string {
  if (error && typeof error === "object" && "name" in error) return String((error as { name: unknown }).name);
  return "";
}

/**
 * Hand the picture to the system share sheet when it can accept a JPEG.
 * On iPhone and iPad that sheet includes Save Image, which writes to Photos.
 * Everywhere else, the JPEG downloads.
 */
export function shareOrSave(file: File): "shared" | "saved" {
  if (canShareFile(file)) {
    void navigator.share({ files: [file] }).catch((error: unknown) => {
      const name = shareErrorName(error);
      if (name === "AbortError" || name === "InvalidStateError") return;
      saveFile(file);
    });
    return "shared";
  }
  saveFile(file);
  return "saved";
}
