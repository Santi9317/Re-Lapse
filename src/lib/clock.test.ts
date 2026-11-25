import assert from "node:assert/strict";
import test from "node:test";
import { CAPSULE_SEAL_MS, capsuleWindow, eventTimes } from "./clock.ts";

test("a timecapsule's hours run from the chosen start and the seal is a day", () => {
  const start = 1_700_000_000_000;
  const chosen = start + 3_600_000;
  const window = capsuleWindow(chosen, 5);
  assert.deepEqual(window, {
    startsAt: chosen,
    endsAt: chosen + 5 * 3_600_000,
    revealAt: chosen + 5 * 3_600_000 + CAPSULE_SEAL_MS,
  });
  const times = eventTimes(start, 5, false, chosen);
  assert.equal(times.startsAt.getTime(), window.startsAt);
  assert.equal(times.endsAt.getTime(), window.endsAt);
  assert.equal(times.revealAt.getTime(), window.revealAt);
  const immediate = eventTimes(start, 2, false);
  assert.equal(immediate.startsAt.getTime(), start);
  assert.equal(immediate.endsAt.getTime() - immediate.startsAt.getTime(), 2 * 3_600_000);
  assert.equal(immediate.revealAt.getTime() - immediate.endsAt.getTime(), CAPSULE_SEAL_MS);
});

test("the lab clock still compresses the window from the chosen start", () => {
  const start = 1_700_000_000_000;
  const later = start + 60_000;
  const times = eventTimes(start, 12, true, later);
  assert.equal(times.startsAt.getTime(), later);
  assert.equal(times.endsAt.getTime() - times.startsAt.getTime(), 40_000);
  assert.equal(times.revealAt.getTime() - times.endsAt.getTime(), 20_000);
});
