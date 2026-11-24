/**
 * Sends a pull request to a person when it adds a lint or type suppression, or adds or changes a skill. CI's
 * `human-review` job runs it: it labels the pull request, and fails until the body names each suppression's
 * file:line with a reason.
 */
import { execFileSync } from "node:child_process";

import { approvalsFile } from "./skills.ts";

export const label = "human review needed";

const code = /\.(ts|mts|cts|tsx|js|mjs|cjs|jsx)$/;
// A directive starts a comment, or a line inside a block comment, so a string that names one is not a suppression.
const marker = /(^|\/\/|\/\*+)\s*(oxlint-disable|eslint-disable|@ts-(ignore|expect-error|nocheck)\b)/;

export const suppressions = (diff: string): ReadonlyArray<string> => {
  const found: Array<string> = [];
  let file = "";
  let line = 0;
  let header = false;
  for (const text of diff.split("\n")) {
    if (text.startsWith("diff --git ")) {
      header = true;
      continue;
    }
    if (header && text.startsWith("+++ ")) {
      file = text
        .slice(4)
        .replace(/\t.*$/, "")
        .replace(/^"(.*)"$/, "$1")
        .replace(/^b\//, "");
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(text);
    if (hunk !== null) {
      header = false;
      line = Number(hunk[1]);
      continue;
    }
    if (header) {
      continue;
    }
    if (text.startsWith("+") && code.test(file) && marker.test(text.slice(1))) {
      found.push(`${file}:${line}`);
    }
    if (text.startsWith("+") || text.startsWith(" ")) {
      line++;
    }
  }
  return found;
};

/** Files the diff touches that make up a skill or its approval. */
export const skills = (diff: string): ReadonlyArray<string> =>
  [...diff.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)]
    .flatMap(([, from = "", to = ""]) => [from, to])
    .filter((path, index, paths) => paths.indexOf(path) === index)
    .filter((path) => path === approvalsFile || /(^|\/)SKILL\.md$/.test(path) || /^\.[^/]+\/skills\//.test(path));

export const unexplained = (found: ReadonlyArray<string>, body: string): ReadonlyArray<string> => {
  const lines = body.split("\n");
  return found.filter((at) => {
    const named = new RegExp(
      `(?<=^|[\\s\`'"(\\[])${at.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[\\s\`'"),:;]|\\.(\\s|$))`,
    );
    return !lines.some(
      (text) =>
        named.test(text) &&
        text
          .replace(at, "")
          .replace(/\S*:\d+\S*/g, "")
          .split(/\W+/)
          .filter(Boolean).length >= 3,
    );
  });
};

if (import.meta.main) {
  const repo = process.env.GITHUB_REPOSITORY ?? "";
  const pr = process.env.PR ?? "";
  const diff = execFileSync("gh", ["pr", "diff", pr, "--repo", repo], { encoding: "utf8", maxBuffer: 1 << 28 });
  const found = suppressions(diff);
  const skillFiles = skills(diff);
  if (found.length > 0 || skillFiles.length > 0) {
    execFileSync("gh", ["api", "--method", "POST", `repos/${repo}/issues/${pr}/labels`, "-f", `labels[]=${label}`]);
    for (const file of skillFiles) {
      process.stdout.write(
        `${file}: this pull request adds or changes a skill, so a person reviews it before it merges.\n`,
      );
    }
    const missing = unexplained(found, process.env.BODY ?? "");
    for (const at of missing) {
      process.stdout.write(
        `${at}: this pull request adds a suppression here, so a person reviews it. Add a line to the pull request body that names \`${at}\` and says why the check is wrong at this spot and why the code cannot satisfy it instead.\n`,
      );
    }
    process.exitCode = missing.length > 0 ? 1 : 0;
  }
}
