import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductDetailDrawer } from "@/components/products/ProductDetailDrawer";
import { type NormalizedProduct } from "@/lib/finlife/types";

function renderProduct(product: NormalizedProduct): string {
  return renderToStaticMarkup(
    <ProductDetailDrawer
      amountWonDefault={10_000_000}
      initialOption={product.options[1] ?? product.options[0]}
      kind="deposit"
      onOpenChange={() => undefined}
      open
      product={product}
    />,
  );
}

function count(text: string, value: string): number {
  return text.split(value).length - 1;
}

describe("product detail drawer responsive option presentation", () => {
  it("renders the same non-empty option fields in mobile cards and the desktop table", () => {
    const html = renderProduct({
      fin_prdt_cd: "responsive-product",
      fin_prdt_nm: "반응형 검증 예금",
      options: [
        { save_trm: "6", intr_rate: 2.7, intr_rate2: 3, raw: { intr_rate_type_nm: "단리" } },
        { save_trm: "12", intr_rate: 3.1, intr_rate2: 3.5, raw: { intr_rate_type_nm: "복리" } },
      ],
      raw: {},
    });

    expect(count(html, "data-option-mobile-card")).toBe(2);
    expect(count(html, "data-option-desktop-table")).toBe(1);
    const optionFields = Array.from(
      html.matchAll(/data-option-field="([^"]+)" data-option-value="([^"]*)"/g),
      ([, label, value]) => [label, value],
    );
    const expectedFields = [
      ["기간", "6개월"],
      ["이자 방식", "단리"],
      ["기본금리(연)", "2.7%"],
      ["최고금리(연, 우대포함)", "3%"],
      ["기간", "12개월"],
      ["이자 방식", "복리"],
      ["기본금리(연)", "3.1%"],
      ["최고금리(연, 우대포함)", "3.5%"],
    ];
    expect(optionFields).toEqual([...expectedFields, ...expectedFields]);
    expect(html).toContain('class="space-y-3 md:hidden"');
    expect(html).toContain("md:block");
    expect(html).toMatch(/aria-pressed="true"[^>]*>12개월<\/button>/);
  });

  it("shows a dedicated empty state instead of a header-only table", () => {
    const html = renderProduct({
      fin_prdt_cd: "empty-product",
      fin_prdt_nm: "옵션 없는 예금",
      options: [],
      raw: {},
    });

    expect(html).toContain("현재 공시 옵션을 확인하지 못했습니다.");
    expect(html).not.toContain("data-option-mobile-list");
    expect(html).not.toContain("data-option-desktop-table");
  });

  it("distinguishes an option with no public detail fields from no options", () => {
    const html = renderProduct({
      fin_prdt_cd: "detail-empty-product",
      fin_prdt_nm: "상세 누락 예금",
      options: [{ raw: { unknown_internal_field: "hidden" } }],
      raw: {},
    });

    expect(count(html, "상세 옵션 정보를 확인하지 못했습니다.")).toBe(2);
    expect(html).not.toContain("현재 공시 옵션을 확인하지 못했습니다.");
    expect(html).not.toContain("unknown_internal_field");
  });
});
