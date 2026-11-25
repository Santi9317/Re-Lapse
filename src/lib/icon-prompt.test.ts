import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { SHORTCUT_ICON_FILES } from "./home-icons.ts";
import {
  APP_ICON_FILES,
  ICON_DIGEST,
  ICON_PROMPT_DISMISS,
  ICON_PROMPT_KICKER,
  ICON_PROMPT_STEPS,
  ICON_PROMPT_TITLE,
  PREVIOUS_ICON_DIGEST,
  iconFilesChanged,
  iconPromptPlan,
  iconReleaseFromJson,
} from "./icon-prompt.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PRE_WINK = "42097b791bcab9389e7d97de7174e3e42c4e85f5ec406ca82f8ceb149b32ad48";

function hashIconFiles(): string {
  const hash = createHash("sha256");
  for (const name of APP_ICON_FILES) {
    hash.update(name);
    hash.update("\0");
    hash.update(readFileSync(new URL(`../../public/icons/${name}`, import.meta.url)));
  }
  return hash.digest("hex");
}

function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

test("the prompt tells someone who already has the shortcut how to save it again", () => {
  assert.equal(ICON_PROMPT_KICKER, "Home Screen");
  assert.equal(ICON_PROMPT_TITLE, "Save the shortcut to the Home Screen again so the new icon appears.");
  assert.deepEqual(
    [...ICON_PROMPT_STEPS],
    ["Share", "Add to the Home Screen", "Remove the old shortcut if it is still there."],
  );
  assert.equal(ICON_PROMPT_DISMISS, "Got it");
  const copy = [ICON_PROMPT_KICKER, ICON_PROMPT_TITLE, ...ICON_PROMPT_STEPS, ICON_PROMPT_DISMISS].join("\n");
  const lower = copy.toLowerCase();
  assert.equal(/iphone|safari|android|deploy|pull request|\blab\b|\bsanti\b|\bmaker\b/.test(lower), false);
  assert.equal(/#\d+/.test(copy), false);
  assert.equal(/swap|replaces the stored|replace the stored/.test(lower), false);
});

test("the sheet is separate and does not activate a worker or stop the camera", () => {
  const shell = readFileSync(new URL("../components/Shell.tsx", import.meta.url), "utf8");
  assert.match(shell, /data-shell="icon"/);
  assert.match(shell, /ICON_PROMPT_TITLE/);
  assert.match(shell, /ICON_PROMPT_STEPS/);
  assert.match(shell, /ICON_PROMPT_DISMISS/);
  assert.equal(/skipWaiting\s*\(/.test(shell), false);
  assert.equal(/getTracks\s*\(/.test(shell), false);
  assert.equal(/\.stop\s*\(/.test(shell), false);
});

test("an update whose icon files differ asks once after the camera opens", () => {
  const release = { version: "8.1", icon: "next-art", previousIcon: "previous-art" };
  assert.equal(iconFilesChanged(release.icon, release.previousIcon), true);
  const waiting = iconPromptPlan({
    release,
    seen: null,
    pending: null,
    updateWaiting: true,
    justUpdated: false,
    blocked: true,
  });
  assert.deepEqual(waiting, { pending: "8.1", show: false });
  const opened = iconPromptPlan({
    release,
    seen: null,
    pending: waiting.pending,
    updateWaiting: false,
    justUpdated: false,
    blocked: false,
  });
  assert.deepEqual(opened, { pending: "8.1", show: true });
  assert.equal(
    iconPromptPlan({
      release,
      seen: "8.1",
      pending: null,
      updateWaiting: false,
      justUpdated: true,
      blocked: false,
    }).show,
    false,
  );
  assert.equal(
    iconPromptPlan({
      release,
      seen: null,
      pending: null,
      updateWaiting: false,
      justUpdated: false,
      blocked: false,
    }).show,
    false,
  );
});

test("a publish whose icon files match the previous one stays quiet", () => {
  const release = { version: "8.2", icon: "same", previousIcon: "same" };
  const plan = iconPromptPlan({
    release,
    seen: null,
    pending: "8.2",
    updateWaiting: true,
    justUpdated: true,
    blocked: false,
  });
  assert.deepEqual(plan, { pending: "8.2", show: false });
  assert.equal(iconFilesChanged("same", "same"), false);
  assert.equal(iconFilesChanged("next", "same"), true);
  assert.equal(iconFilesChanged("", "same"), false);
  assert.equal(iconFilesChanged("same", ""), false);
  assert.equal(iconReleaseFromJson({ version: "8.2", notes: ["Hi"] }), null);
  assert.equal(iconReleaseFromJson({ version: "8.2", icon: "a", previousIcon: "" }), null);
  assert.deepEqual(iconReleaseFromJson({ version: "8.2", icon: "b", previousIcon: "a" }), {
    version: "8.2",
    icon: "b",
    previousIcon: "a",
  });
});

test("icon digests follow the camera shortcut files, and later publishes keep the previous digest", () => {
  assert.deepEqual(
    SHORTCUT_ICON_FILES.filter((file) => !file.startsWith("gate-")),
    [...APP_ICON_FILES],
  );
  assert.equal(hashIconFiles(), ICON_DIGEST);
  const release = JSON.parse(readFileSync(new URL("../../public/release.json", import.meta.url), "utf8")) as {
    version?: string;
    icon?: string;
    previousIcon?: string;
  };
  assert.equal(release.icon, ICON_DIGEST);
  assert.equal(release.previousIcon, PREVIOUS_ICON_DIGEST);
  assert.deepEqual(iconReleaseFromJson(release), {
    version: release.version,
    icon: ICON_DIGEST,
    previousIcon: PREVIOUS_ICON_DIGEST,
  });

  const baseText = git(["show", "origin/main:public/release.json"]);
  const head = git(["rev-parse", "HEAD"]);
  const main = git(["rev-parse", "origin/main"]);
  if (baseText === null || head === null || main === null) return;
  const base = JSON.parse(baseText) as { icon?: unknown; version?: unknown };
  if (typeof base.icon !== "string" || base.icon.length === 0) {
    assert.equal(PREVIOUS_ICON_DIGEST, PRE_WINK);
    assert.notEqual(ICON_DIGEST, PREVIOUS_ICON_DIGEST);
    return;
  }
  if (head === main) return;
  // Same version as main is still that publish, including an icon change it already recorded.
  if (release.version && release.version === base.version) return;
  assert.equal(PREVIOUS_ICON_DIGEST, base.icon);
  assert.equal(iconFilesChanged(ICON_DIGEST, PREVIOUS_ICON_DIGEST), ICON_DIGEST !== base.icon);
});
