import { readFileSync } from "node:fs";

import { expect, test } from "vite-plus/test";

import { added, unexplained } from "./suppressions.ts";

const diff = readFileSync(new URL("suppressions.fixture.diff", import.meta.url), "utf8");

test("finds each suppression a diff adds to code, at its line in the new file", () => {
  expect(added(diff)).toEqual([
    "packages/core/src/a.ts:3",
    "packages/core/src/a.ts:22",
    "packages/web/src/b.tsx:2",
    "packages/web/src/e.jsx:4",
    "tools/f g.ts:2",
    "tools/f g.ts:3",
    "tools/f g.ts:5",
    "tools/\\303\\246.cjs:1",
  ]);
});

test("a suppression is explained by a body line that names where it is and gives a reason", () => {
  const body = [
    "## Suppressions",
    "- `packages/core/src/a.ts:3`: the worker has no logger yet, and this is its only output.",
    "- `packages/core/src/a.ts:22`",
    "- `packages/web/src/b.tsx:20`: a reason given for another line.",
    "- `old/packages/web/src/e.jsx:4`: a reason given for a file of another path.",
    "- `tools/f g.ts:2backup`: a reason given for a file of another path.",
    "- `tools/f g.ts:3`: the generated file has no types to check.",
  ].join("\n");
  expect(unexplained(added(diff), body)).toEqual([
    "packages/core/src/a.ts:22",
    "packages/web/src/b.tsx:2",
    "packages/web/src/e.jsx:4",
    "tools/f g.ts:2",
    "tools/f g.ts:5",
    "tools/\\303\\246.cjs:1",
  ]);
});
