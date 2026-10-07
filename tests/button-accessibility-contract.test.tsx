import fs from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/Button";

const GLOBALS_CSS = fs.readFileSync("src/app/globals.css", "utf-8");
const DART_SEARCH_SOURCE = [
  "src/components/DartSearchClient.tsx",
  "src/components/dart/DartSearchPanel.tsx",
].map((filePath) => fs.readFileSync(filePath, "utf-8")).join("\n");

function readHexToken(name: string): string {
  const match = GLOBALS_CSS.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!match?.[1]) throw new Error(`missing hex color token: ${name}`);
  return match[1];
}

function relativeLuminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  const [red, green, blue] = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(left: string, right: string): number {
  const leftLuminance = relativeLuminance(left);
  const rightLuminance = relativeLuminance(right);
  const lighter = Math.max(leftLuminance, rightLuminance);
  const darker = Math.min(leftLuminance, rightLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("primary Button accessibility contract", () => {
  it("keeps default, hover, and disabled labels at 4.5:1 or better", () => {
    const foreground = readHexToken("primary-foreground");

    expect(contrastRatio(readHexToken("primary"), foreground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(readHexToken("primary-hover"), foreground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(
      readHexToken("primary-disabled"),
      readHexToken("primary-disabled-foreground"),
    )).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the focus indicator at 3:1 or better on common light surfaces", () => {
    const focusRing = readHexToken("focus-ring");

    expect(contrastRatio(focusRing, readHexToken("surface"))).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(focusRing, readHexToken("background"))).toBeGreaterThanOrEqual(3);
  });

  it("renders solid hover, visible focus, and explicit disabled state classes", () => {
    const markup = renderToStaticMarkup(
      <Button variant="primary" disabled>계속하기</Button>,
    );

    expect(markup).toContain("hover:bg-primary-hover");
    expect(markup).not.toContain("hover:bg-primary/10");
    expect(markup).toContain("focus-visible:ring-focus-ring");
    expect(markup).not.toContain("focus-visible:ring-primary/10");
    expect(markup).toContain("focus-visible:ring-offset-2");
    expect(markup).toContain("disabled:bg-primary-disabled");
    expect(markup).toContain("disabled:text-primary-disabled-foreground");
    expect(markup).toContain("disabled:opacity-100");
    expect(markup).toContain("disabled:hover:bg-primary-disabled");
    expect(markup).toContain("button-focus-accessible");
    expect(markup).toContain("disabled=\"\"");
  });

  it("keeps an outline fallback when forced colors remove box shadows", () => {
    expect(GLOBALS_CSS).toMatch(/@media \(forced-colors: active\)/);
    expect(GLOBALS_CSS).toMatch(/\.button-focus-accessible:focus-visible\s*\{[\s\S]*?outline: 2px solid CanvasText;/);
    expect(GLOBALS_CSS).toMatch(/\.button-focus-accessible:focus-visible\s*\{[\s\S]*?outline-offset: 2px;/);
  });

  it("keeps the dev-only amber primary override readable", () => {
    expect(DART_SEARCH_SOURCE).toContain("bg-amber-700 hover:bg-amber-800 text-white");
    expect(DART_SEARCH_SOURCE).not.toContain("bg-amber-600 hover:bg-amber-700 text-white");
    expect(contrastRatio("#b45309", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#92400e", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});
