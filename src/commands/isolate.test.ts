import test from "node:test";
import assert from "node:assert/strict";

import { isEmptyCherryPickError } from "./actions.js";

test("isEmptyCherryPickError detects empty cherry-pick output", () => {
  const error = new Error(
    [
      "On branch feature/demo",
      "You are currently cherry-picking commit 82ca159.",
      "nothing to commit, working tree clean",
      "The previous cherry-pick is now empty, possibly due to conflict resolution."
    ].join("\n")
  );

  assert.equal(isEmptyCherryPickError(error), true);
});

test("isEmptyCherryPickError ignores unrelated git failures", () => {
  const error = new Error("CONFLICT (content): Merge conflict in src/example.ts");
  assert.equal(isEmptyCherryPickError(error), false);
});
