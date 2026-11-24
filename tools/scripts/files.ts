import { readdirSync } from "node:fs";
import { join } from "node:path";

export const root = join(import.meta.dirname, "../..");

const skip = new Set(["node_modules", ".git", ".void", "dist", ".cloudflare", ".alchemy"]);

/** Every file in the repo, outside dependencies and build output. Symlinks are not followed. */
export const walk = (dir: string = root): ReadonlyArray<string> =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (skip.has(entry.name)) {
      return [];
    }
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
