import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();

function collectSourceFiles(dir: string, output: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const nextPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(nextPath, output);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.(tsx|jsx|ts|js)$/.test(entry.name)) continue;
    output.push(nextPath);
  }
}

function relative(filePath: string): string {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join("/");
}

function listTargetBlankTags(content: string): string[] {
  return content.match(/<[A-Za-z][^>]*target="_blank"[\s\S]*?>/g) ?? [];
}

function hasSafeRel(tag: string): boolean {
  const relMatch = tag.match(/rel\s*=\s*["']([^"']+)["']/);
  if (!relMatch) return false;
  const relValue = relMatch[1] ?? "";
  return /\bnoopener\b/.test(relValue) && /\bnoreferrer\b/.test(relValue);
}

describe("external links opened in a new tab", () => {
  it("always include noopener noreferrer", () => {
    const files: string[] = [];
    collectSourceFiles(path.join(REPO_ROOT, "src"), files);

    const violations: string[] = [];
    for (const filePath of files) {
      const content = fs.readFileSync(filePath, "utf8");
      const tags = listTargetBlankTags(content);
      for (const tag of tags) {
        if (hasSafeRel(tag)) continue;
        violations.push(`${relative(filePath)} :: ${tag.replace(/\s+/g, " ").trim()}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
