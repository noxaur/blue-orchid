import { textMessage } from "@blue-orchid/core";
import { describe, expect, it } from "@effect/vitest";

import { renderMessage } from "./render.ts";

describe("renderMessage", () => {
  it("stays within Discord's 2,000 characters when the text alone is longer", () => {
    const titles = Array.from(
      { length: 30 },
      (_, index) => `A_Very_Long_Show_Title_Number_${index}_With_Marks_And_A_Subtitle_That_Goes_On`,
    );
    const rendered = renderMessage(textMessage(`You follow: ${titles.join(", ")}.`));
    expect(rendered.length).toBeLessThanOrEqual(2000);
    expect(rendered.endsWith("…")).toBe(true);
  });

  it("never splits an emoji at the cut", () => {
    expect(renderMessage(textMessage(`${"a".repeat(1998)}😀abc`))).toBe(`${"a".repeat(1998)}…`);
  });
});
