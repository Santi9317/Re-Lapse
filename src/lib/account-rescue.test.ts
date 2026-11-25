import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the You menu recovers through the existing name and PIN check", () => {
  const sleeve = readFileSync(new URL("../components/Sleeve.tsx", import.meta.url), "utf8");
  const rescue = readFileSync(new URL("../components/AccountRescue.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/gate/pin/route.ts", import.meta.url), "utf8");
  const pin = readFileSync(new URL("../server/profile-pin.ts", import.meta.url), "utf8");

  assert.match(sleeve, /data-sleeve-item="account"/);
  assert.match(sleeve, /Recover an account/);
  assert.match(rescue, /requestRecovery\(/);
  assert.match(rescue, /fetchRescue\(\{ replaceDevice: true \}\)/);
  assert.equal(rescue.includes("/api/"), false);
  assert.match(api, /replaceDevice/);
  assert.match(api, /clearStoredProfile\(\)/);
  assert.match(api, /installRecoveredCamera\(\)/);
  assert.doesNotMatch(api, /installRecoveredCamera[\s\S]*x-shooter-token/);
  assert.match(route, /requestRecovery\(/);
  assert.match(route, /claimRecovery\(/);
  assert.equal(route.includes("replaceDevice"), false);
  assert.match(pin, /export async function requestRecovery\(/);
  assert.match(pin, /pinRestoreDecision\(false, budget\.recent\)/);
  assert.match(pin, /rescueRoom\(/);
});
