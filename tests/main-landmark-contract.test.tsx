import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageShell } from "@/components/ui/PageShell";

const ROOT_LAYOUT_PATH = path.resolve("src/app/layout.tsx");
const STANDALONE_REPORT_PATH = path.resolve("src/lib/planning/v2/report/htmlReport.ts");

function collectSourceFiles(root: string, extensions: Set<string>): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(absolutePath, extensions));
    } else if (extensions.has(path.extname(entry.name))) {
      files.push(absolutePath);
    }
  }
  return files;
}

describe("document main landmark contract", () => {
  it("keeps the root layout as the single runtime main owner with a skip target", () => {
    const source = fs.readFileSync(ROOT_LAYOUT_PATH, "utf8");

    expect(source.match(/<main\b/g)).toHaveLength(1);
    expect(source).toContain('href="#main-content"');
    expect(source).toContain("본문으로 건너뛰기");
    expect(source).toContain('id="main-content"');
    expect(source).toContain("tabIndex={-1}");
    expect(source.indexOf('href="#main-content"')).toBeLessThan(source.indexOf("<SiteHeader"));
    expect(source.indexOf("<SiteHeader")).toBeLessThan(source.indexOf("<main"));
  });

  it("keeps app pages, nested layouts, and shared components free of nested main tags", () => {
    const runtimeSources = [
      ...collectSourceFiles(path.resolve("src/app"), new Set([".tsx", ".jsx"])),
      ...collectSourceFiles(path.resolve("src/components"), new Set([".tsx", ".jsx"])),
    ];
    const offenders = runtimeSources
      .filter((filePath) => filePath !== ROOT_LAYOUT_PATH)
      .filter((filePath) => /<main\b/.test(fs.readFileSync(filePath, "utf8")))
      .map((filePath) => path.relative(process.cwd(), filePath));

    expect(offenders).toEqual([]);
  });

  it("renders PageShell as a neutral wrapper", () => {
    const markup = renderToStaticMarkup(<PageShell>본문</PageShell>);

    expect(markup.startsWith("<div")).toBe(true);
    expect(markup).not.toContain("<main");
  });

  it("keeps the standalone exported report document semantic", () => {
    const source = fs.readFileSync(STANDALONE_REPORT_PATH, "utf8");
    expect(source).toContain('<main class="page">');
    expect(source).toContain("</main>");
  });

  it("does not hide duplicate landmarks with last-main test selectors", () => {
    const e2eSources = collectSourceFiles(path.resolve("tests/e2e"), new Set([".ts", ".tsx"]));
    const offenders = e2eSources
      .filter((filePath) => /locator\(["']main["']\)\.last\(\)/.test(fs.readFileSync(filePath, "utf8")))
      .map((filePath) => path.relative(process.cwd(), filePath));

    expect(offenders).toEqual([]);
  });
});
