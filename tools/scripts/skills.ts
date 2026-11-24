/**
 * Checks that a person approved every skill in the repo: each one has an entry in skill-approvals.json that names
 * who approved it and on which day, and every entry still has its skill.
 */
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { root, walk } from "./files.ts";

export const approvalsFile = "skill-approvals.json";

const login = /^[A-Za-z\d](?:-?[A-Za-z\d]){0,38}$/;
const day = /^\d{4}-\d{2}-\d{2}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `skills` are skill directories relative to the repo root, `today` is YYYY-MM-DD. */
export const problems = (skills: ReadonlyArray<string>, approvals: unknown, today: string): ReadonlyArray<string> => {
  if (!isRecord(approvals)) {
    return [`${approvalsFile} must be an object that maps each skill directory to its approval.`];
  }
  const found: Array<string> = [];
  for (const skill of skills) {
    const approval = approvals[skill];
    const entry = `"${skill}": { "approvedBy": "<their GitHub login>", "approvedOn": "<YYYY-MM-DD>" }`;
    if (approval === undefined) {
      found.push(
        `${skill} is a skill no person has approved. Ask the user whether to keep it. If they approve it, add ${entry} to ${approvalsFile}; if not, delete it. Never approve a skill yourself.`,
      );
      continue;
    }
    const by = isRecord(approval) ? approval.approvedBy : undefined;
    const on = isRecord(approval) ? approval.approvedOn : undefined;
    if (typeof by !== "string" || !login.test(by)) {
      found.push(`${approvalsFile}: ${skill} must name the GitHub login of the person who approved it, as ${entry}.`);
    }
    if (typeof on !== "string" || !day.test(on) || Number.isNaN(Date.parse(on)) || on > today) {
      found.push(`${approvalsFile}: ${skill} must give the day it was approved, no later than today, as ${entry}.`);
    }
  }
  for (const skill of Object.keys(approvals).filter((key) => !skills.includes(key))) {
    found.push(`${approvalsFile} approves ${skill}, which is not a skill in the repo. Remove the entry.`);
  }
  return found;
};

if (import.meta.main) {
  const skills = walk()
    .filter((path) => path.endsWith("/SKILL.md"))
    .map((path) => relative(root, dirname(path)));
  const approvals: unknown = JSON.parse(readFileSync(join(root, approvalsFile), "utf8"));
  const found = problems(skills, approvals, new Date().toISOString().slice(0, 10));
  if (found.length > 0) {
    process.stderr.write(`${found.join("\n")}\n`);
    process.exitCode = 1;
  }
}
