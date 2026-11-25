import type { Chemistry } from "@/lib/types";

/**
 * Disposable 400, in one pass on the original pixels.
 * Exposure is linear RGB. Everything after that stays in floating point
 * until the bytes are written. Daylight and Night only scale the
 * coefficients the profiles override.
 */

export type DisposableProfile = {
  ev: number;
  shadow: number;
  warmth: number;
  grain: number;
  vignette: number;
  bloom: number;
  halation: number;
};

const PROFILES: Record<Chemistry, DisposableProfile> = {
  default: Object.freeze({ ev: -0.3, shadow: 1, warmth: 1, grain: 35, vignette: 12, bloom: 0.065, halation: 0.05 }),
  daylight: Object.freeze({ ev: -0.15, shadow: 1.5, warmth: 0.6, grain: 28, vignette: 8, bloom: 0.04, halation: 0.03 }),
  night: Object.freeze({ ev: 0, shadow: 1.5, warmth: 0.5, grain: 35, vignette: 10, bloom: 0.085, halation: 0.07 }),
};

const CURVE: ReadonlyArray<readonly [number, number]> = [
  [0, 0.0784],
  [0.149, 0.1216],
  [0.251, 0.2],
  [0.502, 0.502],
  [0.749, 0.7608],
  [0.902, 0.8902],
  [1, 0.949],
];

const BANDS: ReadonlyArray<{ center: number; hue: number; sat: number; lum: number }> = [
  { center: 0, hue: 5, sat: 12, lum: -3 },
  { center: 30, hue: -4, sat: 5, lum: 6 },
  { center: 60, hue: -15, sat: 8, lum: 0 },
  { center: 120, hue: -20, sat: -10, lum: -5 },
  { center: 180, hue: -10, sat: 5, lum: -5 },
  { center: 240, hue: -8, sat: 15, lum: -12 },
  { center: 285, hue: 0, sat: -10, lum: 0 },
  { center: 330, hue: 0, sat: -8, lum: 0 },
];

const WEEK = ["SU", "M", "T", "W", "TH", "F", "S"] as const;
const STAMP_CORE = [1, 179 / 255, 72 / 255] as const;
const STAMP_GLOW = [1, 104 / 255, 28 / 255] as const;
const HALATION = [1, 96 / 255, 53 / 255] as const;

type Seg = readonly [number, number, number, number];

const TOP: Seg = [0.22, 0.06, 0.78, 0.06];
const UPPER_RIGHT: Seg = [0.84, 0.12, 0.84, 0.46];
const LOWER_RIGHT: Seg = [0.84, 0.54, 0.84, 0.88];
const BOTTOM: Seg = [0.22, 0.94, 0.78, 0.94];
const LOWER_LEFT: Seg = [0.16, 0.54, 0.16, 0.88];
const UPPER_LEFT: Seg = [0.16, 0.12, 0.16, 0.46];
const MID: Seg = [0.24, 0.5, 0.76, 0.5];

const GLYPHS: Record<string, readonly Seg[]> = {
  "0": [TOP, UPPER_RIGHT, LOWER_RIGHT, BOTTOM, LOWER_LEFT, UPPER_LEFT],
  "1": [UPPER_RIGHT, LOWER_RIGHT],
  "2": [TOP, UPPER_RIGHT, MID, LOWER_LEFT, BOTTOM],
  "3": [TOP, UPPER_RIGHT, MID, LOWER_RIGHT, BOTTOM],
  "4": [UPPER_LEFT, MID, UPPER_RIGHT, LOWER_RIGHT],
  "5": [TOP, UPPER_LEFT, MID, LOWER_RIGHT, BOTTOM],
  "6": [TOP, UPPER_LEFT, MID, LOWER_LEFT, LOWER_RIGHT, BOTTOM],
  "7": [TOP, UPPER_RIGHT, LOWER_RIGHT],
  "8": [TOP, UPPER_RIGHT, LOWER_RIGHT, BOTTOM, LOWER_LEFT, UPPER_LEFT, MID],
  "9": [TOP, UPPER_RIGHT, LOWER_RIGHT, BOTTOM, UPPER_LEFT, MID],
  M: [
    [0.12, 0.94, 0.12, 0.08],
    [0.12, 0.08, 0.5, 0.62],
    [0.88, 0.08, 0.5, 0.62],
    [0.88, 0.94, 0.88, 0.08],
  ],
  T: [
    [0.08, 0.1, 0.92, 0.1],
    [0.5, 0.1, 0.5, 0.94],
  ],
  W: [
    [0.1, 0.08, 0.1, 0.7],
    [0.1, 0.7, 0.5, 0.94],
    [0.9, 0.7, 0.5, 0.94],
    [0.9, 0.08, 0.9, 0.7],
  ],
  H: [
    [0.16, 0.06, 0.16, 0.94],
    [0.84, 0.06, 0.84, 0.94],
    [0.16, 0.5, 0.84, 0.5],
  ],
  F: [
    [0.18, 0.06, 0.18, 0.94],
    [0.18, 0.06, 0.86, 0.06],
    [0.18, 0.48, 0.7, 0.48],
  ],
  S: [TOP, UPPER_LEFT, MID, LOWER_RIGHT, BOTTOM],
  U: [
    [0.16, 0.06, 0.16, 0.78],
    [0.84, 0.06, 0.84, 0.78],
    [0.16, 0.86, 0.84, 0.86],
  ],
  "'": [[0.4, 0.04, 0.58, 0.3]],
  ":": [
    [0.5, 0.32, 0.5, 0.32],
    [0.5, 0.7, 0.5, 0.7],
  ],
  " ": [],
};

export type GradeOptions = {
  chemistry?: Chemistry;
  seed?: string;
  date?: Date | null;
};

type Stroke = { x1: number; y1: number; x2: number; y2: number; thick: number };

export function asChemistry(value: unknown): Chemistry {
  if (value === "daylight" || value === "night" || value === "default") return value;
  return "default";
}

export function disposableProfile(chemistry: Chemistry): DisposableProfile {
  return PROFILES[asChemistry(chemistry)];
}

export function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** A frame that is already dark does not take a negative exposure. */
export function exposureEv(meanY: number, chemistry: Chemistry): number {
  const ev = PROFILES[asChemistry(chemistry)].ev;
  if (ev < 0 && meanY < 0.18) return 0;
  return ev;
}

export function toneCurve(value: number): number {
  const v = clamp01(value);
  const first = CURVE[0];
  if (!first || v <= first[0]) return first ? first[1] : v;
  for (let i = 1; i < CURVE.length; i++) {
    const right = CURVE[i];
    const left = CURVE[i - 1];
    if (!right || !left) break;
    if (v <= right[0]) {
      const span = right[0] - left[0];
      const t = span === 0 ? 0 : (v - left[0]) / span;
      return left[1] + (right[1] - left[1]) * t;
    }
  }
  const last = CURVE[CURVE.length - 1];
  return last ? last[1] : v;
}

export function applyWarmth(r: number, g: number, b: number, scale: number): [number, number, number] {
  return [
    clamp01(r + scale * (0.028 * r + 0.008)),
    clamp01(g - scale * 0.004 * g),
    clamp01(b - scale * (0.037 * b + 0.004)),
  ];
}

export function stampParts(date: Date): { left: string; right: string } | null {
  const time = date.getTime();
  if (!Number.isFinite(time)) return null;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  const week = WEEK[date.getDay()] ?? "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return { left: `${week} ${month} ${day} '${year}`, right: `${hours}:${minutes}` };
}

function srgbToLinear(channel: number): number {
  const c = clamp01(channel);
  if (c <= 0.04045) return c / 12.92;
  return ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  if (channel <= 0) return 0;
  if (channel >= 1) return 1;
  if (channel <= 0.0031308) return 12.92 * channel;
  return 1.055 * channel ** (1 / 2.4) - 0.055;
}

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hash32(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function unit(seed: number, x: number, y: number, salt: number): number {
  const mixed = seed ^ hash32(Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 1, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35));
  return hash32(mixed) / 4294967296;
}

function seedFromPixels(data: ArrayLike<number>, width: number, height: number): string {
  let h = (width * 374761393) ^ (height * 668265263);
  const step = Math.max(1, Math.floor(data.length / 48));
  for (let i = 0; i < data.length; i += step) h = Math.imul(h ^ (data[i] ?? 0), 16777619);
  return (h >>> 0).toString(16);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d <= 1e-8) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

function hueToRgb(p: number, q: number, t: number): number {
  let x = t;
  if (x < 0) x += 1;
  if (x > 1) x -= 1;
  if (x < 1 / 6) return p + (q - p) * 6 * x;
  if (x < 1 / 2) return q;
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s <= 1e-8) return [l, l, l];
  const wrapped = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hueToRgb(p, q, wrapped + 1 / 3), hueToRgb(p, q, wrapped), hueToRgb(p, q, wrapped - 1 / 3)];
}

function gradeColor(r0: number, g0: number, b0: number, profile: DisposableProfile, gain: number): [number, number, number] {
  let r = linearToSrgb(srgbToLinear(r0) * gain);
  let g = linearToSrgb(srgbToLinear(g0) * gain);
  let b = linearToSrgb(srgbToLinear(b0) * gain);
  let y = luma(r, g, b);
  const delta =
    -0.1 * (y - 0.5) +
    0.033 * profile.shadow * (1 - smoothstep(0.1, 0.6, y)) -
    0.025 * (1 - smoothstep(0, 0.23, y)) -
    0.05 * smoothstep(0.48, 0.95, y) -
    0.03 * smoothstep(0.78, 1, y);
  r = toneCurve(r + delta);
  g = toneCurve(g + delta);
  b = toneCurve(b + delta);
  [r, g, b] = applyWarmth(r, g, b, profile.warmth);

  let [h, s, l] = rgbToHsl(r, g, b);
  const skin = Math.exp(-Math.pow((h - 32) / 24, 2));
  s = clamp01(s + 0.12 * (1 - s) * s * (1 - 0.45 * skin) - 0.035 * s);
  let hueW = 0;
  let satW = 0;
  let lumW = 0;
  let sum = 0;
  for (const band of BANDS) {
    let dist = Math.abs(h - band.center);
    if (dist > 180) dist = 360 - dist;
    const weight = Math.max(0, 1 - dist / 43);
    const w = weight * weight;
    sum += w;
    hueW += w * band.hue;
    satW += w * band.sat;
    lumW += w * band.lum;
  }
  if (sum > 0) {
    hueW /= sum;
    satW /= sum;
    lumW /= sum;
  }
  const originalS = s;
  h += 0.38 * hueW;
  s = clamp01(s + 0.006 * satW * originalS);
  l = clamp01(l + 0.003 * lumW * Math.min(1, originalS * 3));
  [r, g, b] = hslToRgb(h, s, l);

  y = luma(r, g, b);
  const shadow = 1 - smoothstep(0.1, 0.65, y);
  const mid = 4 * y * (1 - y);
  const highlight = smoothstep(0.42, 0.95, y);
  r = clamp01(r - 0.013 * shadow + 0.008 * mid + 0.012 * highlight);
  g = clamp01(g + 0.005 * shadow + 0.001 * mid + 0.006 * highlight);
  b = clamp01(b + 0.009 * shadow - 0.01 * mid - 0.02 * highlight);
  return [r, g, b];
}

export function gradeFlat(r: number, g: number, b: number, chemistry: Chemistry = "default"): [number, number, number] {
  const profile = PROFILES[asChemistry(chemistry)];
  const gain = 2 ** exposureEv(luma(r, g, b), asChemistry(chemistry));
  return gradeColor(r, g, b, profile, gain);
}

function lumaAt(rgb: Float32Array, width: number, height: number, x: number, y: number): number {
  const xx = x < 0 ? 0 : x >= width ? width - 1 : x;
  const yy = y < 0 ? 0 : y >= height ? height - 1 : y;
  const i = (yy * width + xx) * 3;
  return luma(rgb[i] ?? 0, rgb[i + 1] ?? 0, rgb[i + 2] ?? 0);
}

function applyDetail(rgb: Float32Array, width: number, height: number): void {
  const n = width * height;
  const add = new Float32Array(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const here = lumaAt(rgb, width, height, x, y);
      const around =
        (lumaAt(rgb, width, height, x - 1, y) +
          lumaAt(rgb, width, height, x + 1, y) +
          lumaAt(rgb, width, height, x, y - 1) +
          lumaAt(rgb, width, height, x, y + 1)) /
        4;
      const detail = here - around;
      add[y * width + x] =
        -0.13 * detail + 0.12 * detail * smoothstep(0.015, 0.1, Math.abs(detail)) + 0.008 * (0.5 - here);
    }
  }
  for (let p = 0; p < n; p++) {
    const o = p * 3;
    const delta = add[p] ?? 0;
    rgb[o] = (rgb[o] ?? 0) + delta;
    rgb[o + 1] = (rgb[o + 1] ?? 0) + delta;
    rgb[o + 2] = (rgb[o + 2] ?? 0) + delta;
  }
}

function blurRgb(src: Float32Array, width: number, height: number, sigma: number): Float32Array {
  if (!(sigma >= 0.2)) return src.slice();
  const radius = Math.max(1, Math.ceil(sigma * 2));
  const kernel = new Float32Array(radius * 2 + 1);
  let kernelSum = 0;
  for (let i = -radius; i <= radius; i++) {
    const weight = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = weight;
    kernelSum += weight;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] = (kernel[i] ?? 0) / kernelSum;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= width) continue;
        const weight = kernel[k + radius] ?? 0;
        const i = (y * width + xx) * 3;
        r += (src[i] ?? 0) * weight;
        g += (src[i + 1] ?? 0) * weight;
        b += (src[i + 2] ?? 0) * weight;
        sum += weight;
      }
      const o = (y * width + x) * 3;
      tmp[o] = sum > 0 ? r / sum : 0;
      tmp[o + 1] = sum > 0 ? g / sum : 0;
      tmp[o + 2] = sum > 0 ? b / sum : 0;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= height) continue;
        const weight = kernel[k + radius] ?? 0;
        const i = (yy * width + x) * 3;
        r += (tmp[i] ?? 0) * weight;
        g += (tmp[i + 1] ?? 0) * weight;
        b += (tmp[i + 2] ?? 0) * weight;
        sum += weight;
      }
      const o = (y * width + x) * 3;
      out[o] = sum > 0 ? r / sum : 0;
      out[o + 1] = sum > 0 ? g / sum : 0;
      out[o + 2] = sum > 0 ? b / sum : 0;
    }
  }
  return out;
}

function blurMono(src: Float32Array, width: number, height: number, sigma: number): Float32Array {
  if (!(sigma >= 0.2)) return src.slice();
  const radius = Math.max(1, Math.ceil(sigma * 2));
  const kernel = new Float32Array(radius * 2 + 1);
  let kernelSum = 0;
  for (let i = -radius; i <= radius; i++) {
    const weight = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = weight;
    kernelSum += weight;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] = (kernel[i] ?? 0) / kernelSum;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = 0;
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= width) continue;
        const weight = kernel[k + radius] ?? 0;
        value += (src[y * width + xx] ?? 0) * weight;
        sum += weight;
      }
      tmp[y * width + x] = sum > 0 ? value / sum : 0;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = 0;
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= height) continue;
        const weight = kernel[k + radius] ?? 0;
        value += (tmp[yy * width + x] ?? 0) * weight;
        sum += weight;
      }
      out[y * width + x] = sum > 0 ? value / sum : 0;
    }
  }
  return out;
}

function applyLight(rgb: Float32Array, width: number, height: number, profile: DisposableProfile): void {
  const n = width * height;
  const longEdge = Math.max(width, height);
  const hi = new Float32Array(n * 3);
  const bright = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    const o = p * 3;
    const y = clamp01(luma(rgb[o] ?? 0, rgb[o + 1] ?? 0, rgb[o + 2] ?? 0));
    const bloom = smoothstep(0.78, 0.88, y);
    hi[o] = (rgb[o] ?? 0) * bloom;
    hi[o + 1] = (rgb[o + 1] ?? 0) * bloom;
    hi[o + 2] = (rgb[o + 2] ?? 0) * bloom;
    bright[p] = smoothstep(0.88, 0.96, y);
  }
  const bloomed = blurRgb(hi, width, height, 0.004 * longEdge);
  const spread = blurMono(bright, width, height, 0.0025 * longEdge);
  for (let p = 0; p < n; p++) {
    const o = p * 3;
    const halo = Math.max(0, (spread[p] ?? 0) - (bright[p] ?? 0));
    rgb[o] = (rgb[o] ?? 0) + (bloomed[o] ?? 0) * 1.04 * profile.bloom + halo * profile.halation * HALATION[0];
    rgb[o + 1] = (rgb[o + 1] ?? 0) + (bloomed[o + 1] ?? 0) * profile.bloom + halo * profile.halation * HALATION[1];
    rgb[o + 2] = (rgb[o + 2] ?? 0) + (bloomed[o + 2] ?? 0) * 0.94 * profile.bloom + halo * profile.halation * HALATION[2];
  }
  const soft = blurRgb(rgb, width, height, 0.00075 * longEdge);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x + 0.5 - width / 2) / (width / 2);
      const ny = (y + 0.5 - height / 2) / (height / 2);
      const mix = smoothstep(0.6, 1, Math.hypot(nx, ny)) * 0.3;
      const o = (y * width + x) * 3;
      rgb[o] = (rgb[o] ?? 0) * (1 - mix) + (soft[o] ?? 0) * mix;
      rgb[o + 1] = (rgb[o + 1] ?? 0) * (1 - mix) + (soft[o + 1] ?? 0) * mix;
      rgb[o + 2] = (rgb[o + 2] ?? 0) * (1 - mix) + (soft[o + 2] ?? 0) * mix;
    }
  }
}

function applyVignette(rgb: Float32Array, width: number, height: number, profile: DisposableProfile): void {
  const dark = 0.15 * (profile.vignette / 12);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x + 0.5 - width / 2) / (width / 2);
      const ny = (y + 0.5 - height / 2) / (height / 2);
      const o = (y * width + x) * 3;
      const yv = clamp01(luma(rgb[o] ?? 0, rgb[o + 1] ?? 0, rgb[o + 2] ?? 0));
      const falloff = 1 - dark * smoothstep(0.36, 1.37, Math.hypot(nx, ny)) * (1 - 0.25 * smoothstep(0.7, 1, yv));
      rgb[o] = (rgb[o] ?? 0) * falloff;
      rgb[o + 1] = (rgb[o + 1] ?? 0) * falloff;
      rgb[o + 2] = (rgb[o + 2] ?? 0) * falloff;
    }
  }
}

function applyGrain(rgb: Float32Array, width: number, height: number, profile: DisposableProfile, seed: number): Float32Array {
  const n = width * height;
  const grain = new Float32Array(n);
  const cell = Math.max(1, 1.5 * (Math.max(width, height) / 1600));
  const scale = profile.grain / 35;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const o = p * 3;
      const fine = unit(seed, x, y, 1) + unit(seed, x, y, 2) + unit(seed, x, y, 3) - 1.5;
      const coarse = unit(seed, Math.floor(x / cell), Math.floor(y / cell), 4) - 0.5;
      const yv = clamp01(luma(rgb[o] ?? 0, rgb[o + 1] ?? 0, rgb[o + 2] ?? 0));
      const amp = (0.76 * fine + 0.24 * coarse) * 0.105 * scale * (0.65 + 0.48 * Math.sin(Math.PI * yv));
      grain[p] = amp;
      rgb[o] = (rgb[o] ?? 0) + amp * (1 + 0.1 * (unit(seed, x, y, 5) * 2 - 1));
      rgb[o + 1] = (rgb[o + 1] ?? 0) + amp * (1 + 0.1 * (unit(seed, x, y, 6) * 2 - 1));
      rgb[o + 2] = (rgb[o + 2] ?? 0) + amp * (1 + 0.1 * (unit(seed, x, y, 7) * 2 - 1));
    }
  }
  return grain;
}

function glyphWidth(ch: string, glyphH: number): number {
  if (ch === " ") return glyphH * 0.36;
  if (ch === "'" || ch === ":") return glyphH * 0.34;
  if (ch === "M" || ch === "W") return glyphH * 0.78;
  return glyphH * 0.56;
}

function measureLine(text: string, glyphH: number): number {
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    width += glyphWidth(text[i] ?? " ", glyphH);
    if (i + 1 < text.length) width += glyphH * 0.18;
  }
  return width;
}

function lineStrokes(text: string, originX: number, top: number, glyphH: number, seed: number, salt: number): Stroke[] {
  const strokes: Stroke[] = [];
  let x = originX;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? " ";
    const w = glyphWidth(ch, glyphH);
    const segs = GLYPHS[ch] ?? [];
    for (let s = 0; s < segs.length; s++) {
      const seg = segs[s];
      if (!seg) continue;
      const j = (part: number) => (unit(seed, i + salt, s, part) - 0.5) * 0.8;
      strokes.push({
        x1: x + seg[0] * w + j(1),
        y1: top + seg[1] * glyphH + j(2),
        x2: x + seg[2] * w + j(3),
        y2: top + seg[3] * glyphH + j(4),
        thick: glyphH * (0.1 + 0.04 * unit(seed, i + salt, s, 5)),
      });
    }
    x += w + glyphH * 0.18;
  }
  return strokes;
}

function pointSegmentDistance(px: number, py: number, stroke: Stroke): number {
  const dx = stroke.x2 - stroke.x1;
  const dy = stroke.y2 - stroke.y1;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 1e-6) t = ((px - stroke.x1) * dx + (py - stroke.y1) * dy) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(px - (stroke.x1 + t * dx), py - (stroke.y1 + t * dy));
}

function coverage(distance: number, radius: number, softness: number): number {
  if (softness <= 0) return distance <= radius ? 1 : 0;
  return 1 - smoothstep(Math.max(0, radius - softness), radius + softness, distance);
}

function applyStamp(rgb: Float32Array, width: number, height: number, date: Date, grain: Float32Array, seed: number): void {
  const parts = stampParts(date);
  if (!parts) return;
  const shortEdge = Math.min(width, height);
  let glyphH = shortEdge * 0.0245;
  const marginX = width * 0.06;
  const available = Math.max(1, width - marginX * 2);
  let leftW = measureLine(parts.left, glyphH);
  let rightW = measureLine(parts.right, glyphH);
  const gap = glyphH * 0.5;
  if (leftW + rightW + gap > available && leftW + rightW > 0) {
    glyphH *= (available - gap) / (leftW + rightW);
    leftW = measureLine(parts.left, glyphH);
    rightW = measureLine(parts.right, glyphH);
  }
  const bottom = height - height * 0.045;
  const top = bottom - glyphH;
  const glow = glyphH * 0.125;
  const strokes = [
    ...lineStrokes(parts.left, marginX, top, glyphH, seed, 20),
    ...lineStrokes(parts.right, width - marginX - rightW, top, glyphH, seed, 80),
  ];
  if (strokes.length === 0) return;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (const stroke of strokes) {
    const pad = stroke.thick * 0.5 + glow + 1.5;
    minX = Math.min(minX, stroke.x1 - pad, stroke.x2 - pad);
    maxX = Math.max(maxX, stroke.x1 + pad, stroke.x2 + pad);
    minY = Math.min(minY, stroke.y1 - pad, stroke.y2 - pad);
    maxY = Math.max(maxY, stroke.y1 + pad, stroke.y2 + pad);
  }
  const x0 = Math.max(0, Math.floor(minX));
  const y0 = Math.max(0, Math.floor(minY));
  const x1 = Math.min(width - 1, Math.ceil(maxX));
  const y1 = Math.min(height - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let core = 0;
      let glowCov = 0;
      const px = x + 0.5;
      const py = y + 0.5;
      for (const stroke of strokes) {
        const distance = pointSegmentDistance(px, py, stroke);
        const half = stroke.thick * 0.5;
        core = Math.max(core, coverage(distance, half, 0.45));
        glowCov = Math.max(glowCov, coverage(distance, half + glow * 0.65, glow * 0.55));
      }
      if (core <= 0 && glowCov <= 0) continue;
      const p = y * width + x;
      const o = p * 3;
      const glowA = Math.min(1, glowCov) * 0.62;
      const coreA = Math.min(1, core) * 0.9;
      let r = rgb[o] ?? 0;
      let g = rgb[o + 1] ?? 0;
      let b = rgb[o + 2] ?? 0;
      r = r * (1 - glowA) + STAMP_GLOW[0] * glowA;
      g = g * (1 - glowA) + STAMP_GLOW[1] * glowA;
      b = b * (1 - glowA) + STAMP_GLOW[2] * glowA;
      r = r * (1 - coreA) + STAMP_CORE[0] * coreA;
      g = g * (1 - coreA) + STAMP_CORE[1] * coreA;
      b = b * (1 - coreA) + STAMP_CORE[2] * coreA;
      const ink = Math.max(glowA, coreA);
      const n = (grain[p] ?? 0) * 0.35 * ink;
      rgb[o] = r + n;
      rgb[o + 1] = g + n;
      rgb[o + 2] = b + n;
    }
  }
}

/** Grade one RGBA frame. The same seed reprints the same grain. */
export function gradeFrame(
  input: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  options: GradeOptions = {},
): Uint8ClampedArray {
  if (width < 1 || height < 1) return new Uint8ClampedArray(0);
  const chemistry = asChemistry(options.chemistry);
  const profile = PROFILES[chemistry];
  const n = width * height;
  const rgb = new Float32Array(n * 3);
  let sumY = 0;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const r = (input[i] ?? 0) / 255;
    const g = (input[i + 1] ?? 0) / 255;
    const b = (input[i + 2] ?? 0) / 255;
    const o = p * 3;
    rgb[o] = r;
    rgb[o + 1] = g;
    rgb[o + 2] = b;
    sumY += luma(r, g, b);
  }
  const gain = 2 ** exposureEv(sumY / n, chemistry);
  for (let p = 0; p < n; p++) {
    const o = p * 3;
    const [r, g, b] = gradeColor(rgb[o] ?? 0, rgb[o + 1] ?? 0, rgb[o + 2] ?? 0, profile, gain);
    rgb[o] = r;
    rgb[o + 1] = g;
    rgb[o + 2] = b;
  }
  applyDetail(rgb, width, height);
  applyLight(rgb, width, height, profile);
  applyVignette(rgb, width, height, profile);
  const seedText = options.seed && options.seed.length > 0 ? options.seed : seedFromPixels(input, width, height);
  const seed = hashSeed(seedText);
  const grain = applyGrain(rgb, width, height, profile, seed);
  if (options.date) applyStamp(rgb, width, height, options.date, grain, seed);
  const out = new Uint8ClampedArray(n * 4);
  for (let p = 0; p < n; p++) {
    const o = p * 3;
    const i = p * 4;
    out[i] = Math.round(clamp01(rgb[o] ?? 0) * 255);
    out[i + 1] = Math.round(clamp01(rgb[o + 1] ?? 0) * 255);
    out[i + 2] = Math.round(clamp01(rgb[o + 2] ?? 0) * 255);
    out[i + 3] = 255;
  }
  return out;
}
