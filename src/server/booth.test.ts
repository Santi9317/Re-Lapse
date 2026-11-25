import assert from "node:assert/strict";
import test from "node:test";
import { boothKind } from "./booth-line.ts";

test("a missing cookie shares one open booth, and a known phone keeps its own", () => {
  assert.equal(boothKind(false, false, false), "share");
  assert.equal(boothKind(true, false, false), "share");
  assert.equal(boothKind(true, true, true), "claim");
  assert.equal(boothKind(true, true, false), "claim");
  assert.equal(boothKind(true, false, true), "keep");
  assert.equal(boothKind(false, true, true), "share");
});
