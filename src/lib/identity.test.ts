import assert from "node:assert/strict";
import test from "node:test";
import { restoredEntries } from "./identity.ts";

const TOKEN = "11111111-1111-4111-8111-111111111111";

test("a wiped phone keeps the snapshot of its profile and camera", () => {
  const filled = restoredEntries(
    { "relapse.shooter": null, "relapse.profile": null, "relapse.camera": null },
    {
      "relapse.shooter": TOKEN,
      "relapse.profile": "{\"username\":\"Ada\"}",
      "relapse.camera": "{\"granted\":true}",
    },
  );
  assert.deepEqual(
    filled.map((entry) => entry.key),
    ["relapse.shooter", "relapse.profile", "relapse.camera"],
  );
});

test("a phone that still has its keys is not replaced by an older snapshot", () => {
  const filled = restoredEntries(
    {
      "relapse.shooter": TOKEN,
      "relapse.profile": "{\"username\":\"Ada\"}",
      "relapse.camera": null,
    },
    {
      "relapse.shooter": "22222222-2222-4222-8222-222222222222",
      "relapse.profile": "{\"username\":\"Bea\"}",
      "relapse.camera": "",
    },
  );
  assert.deepEqual(filled, []);
});

test("a snapshot token has to be a camera id", () => {
  assert.deepEqual(
    restoredEntries({ "relapse.shooter": null, "relapse.profile": null, "relapse.camera": null }, { "relapse.shooter": "nope", "relapse.profile": null, "relapse.camera": null }),
    [],
  );
});
