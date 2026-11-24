import assert from "node:assert/strict";
import test from "node:test";
import { draftWithSavedPortrait, emptyProfile, profilePatch, type Profile } from "./profile.ts";

function ready(over: Partial<Profile> = {}): Profile {
  return {
    ...emptyProfile(),
    username: "Ada",
    emojis: ["📷", "✨", "🌈"],
    carouselIds: ["11111111-1111-4111-8111-111111111111"],
    ...over,
  };
}

test("the first profile save names the person and leaves the strip to shots already taken", () => {
  const patch = profilePatch({ ...emptyProfile(), username: "Ada", emojis: ["📷", "✨", "🌈"] }, null);
  assert.equal(patch.username, "Ada");
  assert.deepEqual(patch.emojis, ["📷", "✨", "🌈"]);
  assert.equal("carouselIds" in patch, false);
});

test("editing a profile sends only the fields that changed", () => {
  const saved = ready();
  const renamed = profilePatch({ ...saved, username: "Ada Lovelace" }, saved);
  assert.deepEqual(renamed, { username: "Ada Lovelace" });

  const rearranged = profilePatch(
    { ...saved, carouselIds: ["22222222-2222-4222-8222-222222222222"] },
    saved,
  );
  assert.deepEqual(rearranged, { carouselIds: ["22222222-2222-4222-8222-222222222222"] });

  const cleared = profilePatch({ ...saved, avatarPhotoId: null, avatarDataUrl: null, avatarUrl: null }, {
    ...saved,
    avatarPhotoId: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(cleared.username, undefined);
  assert.equal(cleared.carouselIds, undefined);
  assert.equal(cleared.keepUpload, false);
  assert.equal(cleared.avatarPhotoId, null);
  assert.equal(cleared.avatarImageBase64, null);
});

test("a stale editor draft keeps the strip already saved", () => {
  const saved = ready();
  const pending = { ...saved, username: "Ada L", carouselIds: [] as string[] };
  const draft = draftWithSavedPortrait(pending, saved);
  assert.equal(draft.username, "Ada L");
  assert.deepEqual(draft.carouselIds, saved.carouselIds);
});
