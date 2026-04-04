import test from "node:test";
import assert from "node:assert/strict";

import { applyConflictChoice, parseConflictText } from "./resolve.js";

const conflictText = [
  "export function example() {",
  "<<<<<<< HEAD",
  "  return 'mine';",
  "=======",
  "  return 'theirs';",
  ">>>>>>> origin/main",
  "}"
].join("\n");

test("parseConflictText extracts conflict hunks and context", () => {
  const parsed = parseConflictText("src/example.ts", conflictText);

  assert.equal(parsed.hunks.length, 1);
  assert.equal(parsed.hunks[0]?.filePath, "src/example.ts");
  assert.match(parsed.hunks[0]?.currentText ?? "", /mine/);
  assert.match(parsed.hunks[0]?.incomingText ?? "", /theirs/);
});

test("applyConflictChoice replaces only the targeted hunk", () => {
  const parsed = parseConflictText("src/example.ts", conflictText);
  const resolved = applyConflictChoice(parsed, 1, "theirs");

  assert.doesNotMatch(resolved, /<<<<<<<|>>>>>>>|=======/);
  assert.match(resolved, /theirs/);
  assert.doesNotMatch(resolved, /mine/);
});
