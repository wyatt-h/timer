import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/*
 * A closed <dialog> is hidden by the browser's own
 * `dialog:not([open]) { display: none }`. Any unconditional display utility
 * on the element beats that rule and leaves the modal rendered inline in the
 * page — it looks like a section of the document instead of a dialog.
 *
 * This has regressed twice, and neither type-checking nor a jsdom render
 * catches it, because jsdom applies no UA stylesheet. Reading the class list
 * is crude but it is the thing that actually fails.
 */
const DISPLAY_UTILITIES = [
  "flex",
  "grid",
  "block",
  "inline-flex",
  "inline-grid",
  "inline-block",
];

function classAttributesFor(file: string) {
  const source = readFileSync(resolve(process.cwd(), file), "utf8");
  return [...source.matchAll(/className="([^"]*agenda-dialog[^"]*)"/g)].map(
    (match) => match[1],
  );
}

describe("native dialog display guard", () => {
  it("keeps display utilities off the import dialog element", () => {
    const classLists = classAttributesFor("src/components/import-dialog.tsx");
    expect(classLists.length).toBeGreaterThan(0);

    for (const classList of classLists) {
      const offenders = classList
        .split(/\s+/)
        .filter((token) => DISPLAY_UTILITIES.includes(token));
      expect(
        offenders,
        `"${offenders.join(", ")}" would override dialog:not([open]) and render the modal inline. ` +
          "Put the layout on .agenda-dialog[open] in globals.css instead.",
      ).toEqual([]);
    }
  });

  it("still hides the dialog when closed and lays it out when open", () => {
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toMatch(/\.agenda-dialog:not\(\[open\]\)\s*\{[^}]*display:\s*none/);
    expect(css).toMatch(/\.agenda-dialog\[open\]\s*\{[^}]*display:\s*flex/);
  });
});
