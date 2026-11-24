import { expect, test } from "vite-plus/test";

import { problems } from "./skills.ts";

const today = "2026-11-24";

test("a skill a person approved, by name and day, passes", () => {
  const approvals = { ".agents/skills/pr": { approvedBy: "noxaur", approvedOn: "2026-11-23" } };
  expect(problems([".agents/skills/pr"], approvals, today)).toEqual([]);
});

test("a skill with no approval, or one that does not say who and when, fails", () => {
  const approvals = {
    ".claude/skills/nameless": { approvedOn: "2026-11-23" },
    ".claude/skills/future": { approvedBy: "noxaur", approvedOn: "2026-11-25" },
    ".claude/skills/bot": { approvedBy: "claude[bot]", approvedOn: "2026-13-01" },
  };
  const found = problems(
    [".claude/skills/new", ".claude/skills/nameless", ".claude/skills/future", ".claude/skills/bot"],
    approvals,
    today,
  );
  expect(found.map((problem) => problem.split(" must ")[0]?.split(" is a ")[0])).toEqual([
    ".claude/skills/new",
    "skill-approvals.json: .claude/skills/nameless",
    "skill-approvals.json: .claude/skills/future",
    "skill-approvals.json: .claude/skills/bot",
    "skill-approvals.json: .claude/skills/bot",
  ]);
});

test("an approval whose skill is gone fails", () => {
  const approvals = { ".claude/skills/gone": { approvedBy: "noxaur", approvedOn: "2026-11-23" } };
  expect(problems([], approvals, today)).toEqual([
    "skill-approvals.json approves .claude/skills/gone, which is not a skill in the repo. Remove the entry.",
  ]);
});
