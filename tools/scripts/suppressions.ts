/**
 * Sends a pull request that adds a lint or type suppression to a person. CI's `suppressions` job runs it: it labels
 * the pull request and fails until the body names each suppression's file:line with a reason.
 */
import { execFileSync } from "node:child_process";

export const label = "human review needed";

const code = /\.(ts|mts|cts|tsx|js|mjs|cjs|jsx)$/;
// A directive starts a comment, or a line inside a block comment, so a string that names one is not a suppression.
const marker = /(^|\/\/|\/\*+)\s*(oxlint-disable|eslint-disable|@ts-(ignore|expect-error|nocheck)\b)/;

export const added = (diff: string): ReadonlyArray<string> => {
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
  const found = added(diff);
  if (found.length > 0) {
    execFileSync("gh", ["api", "--method", "POST", `repos/${repo}/issues/${pr}/labels`, "-f", `labels[]=${label}`]);
    const missing = unexplained(found, process.env.BODY ?? "");
    for (const at of missing) {
      process.stdout.write(
        `${at}: this pull request adds a suppression here, so a person reviews it. Add a line to the pull request body that names \`${at}\` and says why the check is wrong at this spot and why the code cannot satisfy it instead.\n`,
      );
    }
    process.exitCode = missing.length > 0 ? 1 : 0;
  }
}
