import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import zlib from "node:zlib";
import { APP_VERSION } from "./release.ts";
import {
  SHORTCUT_ICON_FILES,
  appShortcutIcons,
  gateShortcutIcons,
  shortcutIconDestination,
  shortcutIconPath,
} from "./home-icons.ts";

const APPROVED = {
  "apple-touch-icon.png": "2c7526b1a8ed3d6378fd22e560841da41382b811d5370b250b4b83e086037d48",
  "icon-192.png": "42dd78cd44f06382363ce80cde2ccf12cd502af7b7f2979b6ba73ab2a829f4ff",
  "icon-512.png": "2caf2190babdc519f9b5bc3905823091486232348c1c24ebdafca58ecf4ef273",
  "gate-apple-touch-icon.png": "14099a40fe9d8d8f01dcd36d2db921037fdec3c59875f298fee118af79955e34",
  "gate-192.png": "2c58693b2d6aba03449d09f6c99b2fc69fea405f51ad16412badc7c7addaf0ee",
  "gate-512.png": "28820d7fbe5d490f89bf7efb6fcf132fd4dbb2fed47ffb6572d57cc9e3e86833",
} as const;

function sha(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function decodePng(buf: Buffer): { width: number; height: number; rgba: Buffer } {
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += 12 + len;
  }
  if (bitDepth !== 8 || colorType !== 6) throw new Error(`unexpected png ${bitDepth} ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const rgba = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const left = i >= 4 ? cur[i - 4] : 0;
      const up = prev[i];
      const ul = i >= 4 ? prev[i - 4] : 0;
      let value = row[i];
      if (filter === 1) value = (row[i] + left) & 255;
      else if (filter === 2) value = (row[i] + up) & 255;
      else if (filter === 3) value = (row[i] + ((left + up) >> 1)) & 255;
      else if (filter === 4) {
        const p = left + up - ul;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - ul);
        const pr = pa <= pb && pa <= pc ? left : pb <= pc ? up : ul;
        value = (row[i] + pr) & 255;
      } else if (filter !== 0) throw new Error(`filter ${filter}`);
      cur[i] = value;
    }
    rgba.set(cur, y * stride);
    prev = cur;
  }
  return { width, height, rgba };
}

function pixel(img: { width: number; rgba: Buffer }, x: number, y: number) {
  const i = (y * img.width + x) * 4;
  return { r: img.rgba[i], g: img.rgba[i + 1], b: img.rgba[i + 2] };
}

test("a versioned shortcut path maps onto the approved file and nothing else", () => {
  assert.equal(shortcutIconDestination(`/icons/shortcut/${APP_VERSION}/apple-touch-icon.png`), "/icons/apple-touch-icon.png");
  assert.equal(shortcutIconDestination("/icons/shortcut/9.1/gate-512.png"), "/icons/gate-512.png");
  assert.equal(shortcutIconDestination("/icons/apple-touch-icon.png"), null);
  assert.equal(shortcutIconDestination("/icons/shortcut/1.57/other.png"), null);
  assert.equal(shortcutIconDestination("/icons/shortcut/1.57/../apple-touch-icon.png"), null);
  assert.equal(shortcutIconDestination("/icons/shortcut/nope/apple-touch-icon.png"), null);
  const app = appShortcutIcons(APP_VERSION);
  const gate = gateShortcutIcons(APP_VERSION);
  assert.equal(app.apple, shortcutIconPath(APP_VERSION, "apple-touch-icon.png"));
  assert.notEqual(app.apple, gate.apple);
  assert.equal(app.apple.includes(APP_VERSION), true);
  assert.equal(gate.any512.includes("gate-512.png"), true);
});

test("the approved files are the wink on black and the gate shutter", () => {
  for (const file of SHORTCUT_ICON_FILES) {
    const bytes = readFileSync(new URL(`../../public/icons/${file}`, import.meta.url));
    assert.equal(sha(bytes), APPROVED[file]);
    const img = decodePng(bytes);
    const corner = pixel(img, 2, 2);
    const center = pixel(img, img.width >> 1, img.height >> 1);
    assert.deepEqual(corner, { r: 0, g: 0, b: 0 });
    const wink = !file.startsWith("gate-");
    if (wink) {
      assert.equal(center.r > 240 && center.g > 200 && center.b < 20, true);
    } else {
      assert.equal(center.b > 100 && center.b > center.r && center.b > center.g, true);
    }
  }
});

test("the manifests and the worker carry this publish's icon URLs", () => {
  const appManifest = JSON.parse(readFileSync(new URL("../../public/manifest.webmanifest", import.meta.url), "utf8")) as {
    id?: string;
    start_url?: string;
    icons?: { src?: string }[];
  };
  const gateManifest = JSON.parse(readFileSync(new URL("../../public/gate.webmanifest", import.meta.url), "utf8")) as {
    id?: string;
    start_url?: string;
    icons?: { src?: string }[];
  };
  const app = appShortcutIcons(APP_VERSION);
  const gate = gateShortcutIcons(APP_VERSION);
  assert.equal(appManifest.id, "/");
  assert.equal(appManifest.start_url, "/");
  assert.deepEqual(appManifest.icons?.map((icon) => icon.src), [app.any192, app.any512]);
  assert.equal(gateManifest.id, "/gate");
  assert.equal(gateManifest.start_url, "/gate");
  assert.deepEqual(gateManifest.icons?.map((icon) => icon.src), [gate.any192, gate.any512]);
  assert.equal(JSON.stringify(appManifest).includes("gate-"), false);
  assert.equal(JSON.stringify(gateManifest).includes("apple-touch-icon.png"), false);

  const sw = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
  const workerVersion = /const RELEASE_VERSION = "([^"]+)"/.exec(sw)?.[1];
  assert.equal(workerVersion, APP_VERSION);
  for (const file of SHORTCUT_ICON_FILES) {
    assert.match(sw, new RegExp(`/icons/shortcut/\\$\\{RELEASE_VERSION\\}/\\$\\{file\\}`));
    assert.match(sw, new RegExp(file.replace(/\./g, "\\.")));
  }
  const install = sw.slice(sw.indexOf('addEventListener("install"'), sw.indexOf('addEventListener("message"'));
  const installCode = install.replace(/\/\/.*$/gm, "");
  assert.equal(/skipWaiting\s*\(/.test(installCode), false);
  assert.match(sw, /type === "SKIP_WAITING"\) self\.skipWaiting\(\)/);
  assert.equal(sw.includes("caches.delete"), false);
  const freshFn = sw.slice(sw.indexOf("function fresh"), sw.indexOf('addEventListener("fetch"'));
  assert.match(freshFn, /cache:\s*"reload"/);
  const iconFetch = sw.slice(sw.indexOf('pathname.startsWith("/icons/shortcut/"'), sw.indexOf("const local"));
  assert.match(iconFetch, /fresh\(request\)/);

  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const gatePage = readFileSync(new URL("../app/gate/page.tsx", import.meta.url), "utf8");
  assert.match(layout, /appShortcutIcons\(APP_VERSION\)/);
  assert.match(gatePage, /gateShortcutIcons\(APP_VERSION\)/);
  const route = readFileSync(new URL("../app/icons/shortcut/[version]/[name]/route.ts", import.meta.url), "utf8");
  assert.match(route, /shortcutIconDestination/);
  assert.match(route, /readFile/);
  assert.match(route, /content-type": "image\/png"/);
  assert.equal(/NextResponse\.(rewrite|redirect)/.test(route), false);
  const middleware = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  assert.equal(middleware.includes("shortcutIconDestination"), false);
});
