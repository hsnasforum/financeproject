import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getProviderChipScrollOffset, ProviderChips } from "../src/components/ui/ProviderChips";

describe("ProviderChips", () => {
  it("keeps every provider selectable and announces horizontal exploration", () => {
    const providers = Array.from({ length: 6 }, (_, index) => ({
      id: `provider-${index}`,
      name: `기관 ${index + 1}`,
    }));
    const html = renderToStaticMarkup(
      <ProviderChips providers={providers} selectedId="provider-0" onSelect={() => undefined} />,
    );

    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="금융기관 선택"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("기관 더 보기");
    expect((html.match(/<button/g) ?? [])).toHaveLength(6);
  });

  it("maps only horizontal arrow keys to a bounded scroll distance", () => {
    expect(getProviderChipScrollOffset("ArrowRight", 300)).toBe(210);
    expect(getProviderChipScrollOffset("ArrowLeft", 300)).toBe(-210);
    expect(getProviderChipScrollOffset("Enter", 300)).toBeNull();
  });
});
