import assert from "node:assert/strict";
import test from "node:test";
import { SHARED_PHONE, phoneBudget } from "./phone-budget.ts";

test("a booth with no phone of its own uses the shared phone", () => {
  assert.equal(phoneBudget(null), SHARED_PHONE);
  assert.equal(phoneBudget(undefined), SHARED_PHONE);
  assert.equal(phoneBudget(""), SHARED_PHONE);
  assert.equal(phoneBudget("   "), SHARED_PHONE);
  assert.equal(phoneBudget(SHARED_PHONE), SHARED_PHONE);
  assert.equal(phoneBudget("8c1a2d3e-4f50-4678-89ab-0123456789ab"), "8c1a2d3e-4f50-4678-89ab-0123456789ab");
});
