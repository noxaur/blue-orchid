/**
 * Checks the docs agents rely on: every page in docs/ is linked from docs/README.md, and every relative link in
 * docs/, AGENTS.md files and skills points at a file that exists.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { root, walk } from "./files.ts";

const markdown = walk().filter(
  (path) =>
    path.endsWith(".md") && (path.includes("/docs/") || path.endsWith("AGENTS.md") || path.includes("/.claude/")),
);

const problems: Array<string> = [];

for (const file of markdown) {
  for (const [, target = ""] of readFileSync(file, "utf8").matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
    if (/^[a-z]+:/i.test(target)) {
      continue;
    }
    if (!existsSync(join(dirname(file), target))) {
      problems.push(
        `${relative(root, file)} links to ${target}, which does not exist. Fix the path or remove the link.`,
      );
    }
  }
}

const index = readFileSync(join(root, "docs/README.md"), "utf8");
for (const page of markdown.filter((path) => path.includes("/docs/") && !path.endsWith("docs/README.md"))) {
  const link = relative(join(root, "docs"), page);
  if (!index.includes(`(${link})`)) {
    problems.push(`docs/${link} is not linked from docs/README.md. Add a line for it there, so agents can find it.`);
  }
}

if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exitCode = 1;
}
