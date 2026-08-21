import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductDetailDrawer } from "@/components/products/ProductDetailDrawer";
import { FINLIFE_FIELD_CONFIG } from "@/lib/finlife/fieldConfig";
import {
  buildProductDetailOptionRows,
  buildProductDetailOptionSelectionLabels,
  parseProductDetailTerm,
  pickProductDetailRate,
  resolveProductDetailOptionKey,
} from "@/lib/finlife/productDetailOption";
import { type NormalizedProduct } from "@/lib/finlife/types";
import { selectBestOption } from "@/lib/recommend/selectOption";
import { calcDeposit } from "@/lib/planning/calc";
import { formatKrwWithEok } from "@/lib/format/krw";

const product: NormalizedProduct = {
  fin_prdt_cd: "detail-option-fixture",
  kor_co_nm: "테스트은행",
  fin_prdt_nm: "옵션 정합성 예금",
  options: [
    {
      save_trm: "12",
      intr_rate: 2.8,
      intr_rate2: 3.1,
      raw: { intr_rate_type_nm: "단리" },
    },
    {
      save_trm: "12",
      intr_rate: 3,
      intr_rate2: 3.4,
      raw: { intr_rate_type_nm: "복리" },
    },
    {
      save_trm: "24",
      intr_rate: 3.2,
      intr_rate2: 3.7,
      raw: { intr_rate_type_nm: "단리" },
    },
  ],
  best: {
    save_trm: "24",
    intr_rate: 3.2,
    intr_rate2: 3.7,
  },
  raw: {},
};

function renderDrawer(inputProduct: NormalizedProduct, initialOption = inputProduct.best) {
  return renderToStaticMarkup(
    <ProductDetailDrawer
      amountWonDefault={10_000_000}
      initialOption={initialOption}
      kind="deposit"
      onOpenChange={() => undefined}
      open
      product={inputProduct}
    />,
  );
}

describe("product detail option fidelity", () => {
  it("uses stable distinct keys for same-term options and keeps canonical detail fields", () => {
    const rows = buildProductDetailOptionRows({
      kind: "deposit",
      options: product.options,
      optionFields: FINLIFE_FIELD_CONFIG.deposit?.optionFields,
    });

    expect(new Set(rows.map((row) => row.key)).size).toBe(3);
    expect(rows[0].key).not.toBe(rows[1].key);
    expect(buildProductDetailOptionSelectionLabels(rows)).toEqual([
      "12개월 · 단리 · 최고금리(연, 우대포함) 3.1%",
      "12개월 · 복리 · 최고금리(연, 우대포함) 3.4%",
      "24개월",
    ]);
    expect(rows[2]).toMatchObject({
      termMonths: 24,
      baseRatePct: 3.2,
      primeRatePct: 3.7,
      interestType: "simple",
      isCalculable: true,
    });
    expect(rows[2].detailEntries.map((entry) => entry.label)).toEqual([
      "기간",
      "이자 방식",
      "기본금리(연)",
      "최고금리(연, 우대포함)",
    ]);
    expect(resolveProductDetailOptionKey(rows, product.best)).toBe(rows[2].key);
    expect(pickProductDetailRate(rows[2], "prime")).toBe(3.7);
    expect(selectBestOption(product, {
      purpose: "seed-money",
      kind: "deposit",
      preferredTerm: 24,
      liquidityPref: "mid",
      rateMode: "max",
      topN: 10,
    }).detailOptionKey).toBe(rows[2].key);
  });

  it("keeps semantic keys stable across reordering and collapses exact duplicate options", () => {
    const exactDuplicate = { ...product.options[0], raw: { ...product.options[0].raw } };
    const original = buildProductDetailOptionRows({
      kind: "deposit",
      options: [product.options[0], exactDuplicate, product.options[1]],
      optionFields: FINLIFE_FIELD_CONFIG.deposit?.optionFields,
    });
    const reordered = buildProductDetailOptionRows({
      kind: "deposit",
      options: [product.options[1], exactDuplicate, product.options[0]],
      optionFields: FINLIFE_FIELD_CONFIG.deposit?.optionFields,
    });

    expect(original).toHaveLength(2);
    expect(reordered).toHaveLength(2);
    expect(new Set(original.map((row) => row.key))).toEqual(new Set(reordered.map((row) => row.key)));
  });

  it("keeps distinct loan rates and limits as separate detail options", () => {
    const rows = buildProductDetailOptionRows({
      kind: "mortgage-loan",
      options: [
        {
          raw: {
            lend_rate_type_nm: "고정금리",
            rpym_type_nm: "원리금균등",
            lend_rate_min: 3.2,
            lend_rate_max: 4.1,
            loan_lmt: "2억원",
          },
        },
        {
          raw: {
            lend_rate_type_nm: "고정금리",
            rpym_type_nm: "원리금균등",
            lend_rate_min: 3.5,
            lend_rate_max: 4.4,
            loan_lmt: "3억원",
          },
        },
      ],
      optionFields: FINLIFE_FIELD_CONFIG["mortgage-loan"]?.optionFields,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0].key).not.toBe(rows[1].key);
    expect(buildProductDetailOptionSelectionLabels(rows)).toEqual(["옵션 1", "옵션 2"]);
  });

  it("selects the caller option explicitly without reordering the source options", () => {
    const html = renderDrawer(product);

    expect(html).toMatch(/aria-pressed="true"[^>]*>24개월<\/button>/);
    expect(html).toContain('data-selected-option-term="24"');
    expect(html).toContain('data-selected-option-rate="3.7"');
    expect(html).toContain("예상 수령액");
    expect(product.options.map((option) => option.save_trm)).toEqual(["12", "12", "24"]);
  });

  it("exposes distinct same-term option names and keeps the chosen calculation basis", () => {
    const html = renderDrawer(product, product.options[1]);

    expect(html).toContain("12개월 · 단리 · 최고금리(연, 우대포함) 3.1%");
    expect(html).toMatch(/aria-pressed="true"[^>]*>12개월 · 복리 · 최고금리\(연, 우대포함\) 3.4%<\/button>/);
    expect(html).toContain('data-selected-option-rate="3.4"');
  });

  it("prefers a complete alternative over a closer option with missing rate", () => {
    const selected = selectBestOption({
      ...product,
      options: [
        { save_trm: "12", intr_rate: null, intr_rate2: null, raw: { intr_rate_type_nm: "단리" } },
        { save_trm: "24", intr_rate: 3.2, intr_rate2: 3.7, raw: { intr_rate_type_nm: "단리" } },
      ],
      best: undefined,
    }, {
      purpose: "seed-money",
      kind: "deposit",
      preferredTerm: 12,
      liquidityPref: "mid",
      rateMode: "max",
      topN: 10,
    });

    expect(selected).toMatchObject({
      saveTrm: "24",
      termMonths: 24,
      appliedRate: 3.7,
      rateSource: "intr_rate2",
    });
  });

  it("breaks equal-term equal-rate ties by semantic identity instead of source order", () => {
    const firstOrder = [
      { save_trm: "12", intr_rate: 3, intr_rate2: 3.4, raw: { intr_rate_type_nm: "단리" } },
      { save_trm: "12", intr_rate: 3, intr_rate2: 3.4, raw: { intr_rate_type_nm: "복리" } },
    ];
    const profile = {
      purpose: "seed-money" as const,
      kind: "deposit" as const,
      preferredTerm: 12 as const,
      liquidityPref: "mid" as const,
      rateMode: "max" as const,
      topN: 10,
    };

    const selectedFirst = selectBestOption({ ...product, options: firstOrder, best: undefined }, profile);
    const selectedReversed = selectBestOption({ ...product, options: [...firstOrder].reverse(), best: undefined }, profile);

    expect(selectedFirst.detailOptionKey).toBeTruthy();
    expect(selectedReversed.detailOptionKey).toBe(selectedFirst.detailOptionKey);
  });

  it("shows saving contribution type when otherwise identical options need disambiguation", () => {
    const rows = buildProductDetailOptionRows({
      kind: "saving",
      options: [
        { save_trm: "12", intr_rate: 3, intr_rate2: 3.4, raw: { intr_rate_type_nm: "단리", rsrv_type_nm: "정액적립식" } },
        { save_trm: "12", intr_rate: 3, intr_rate2: 3.4, raw: { intr_rate_type_nm: "단리", rsrv_type_nm: "자유적립식" } },
      ],
      optionFields: FINLIFE_FIELD_CONFIG.saving?.optionFields,
    });

    expect(rows[0].detailEntries.map((entry) => entry.label)).toContain("적립 유형");
    expect(buildProductDetailOptionSelectionLabels(rows)).toEqual([
      "12개월 · 단리 · 정액적립식 · 최고금리(연, 우대포함) 3.4%",
      "12개월 · 단리 · 자유적립식 · 최고금리(연, 우대포함) 3.4%",
    ]);
  });

  it.each([
    {
      label: "missing term",
      option: { intr_rate: 2.5, intr_rate2: 3, raw: { intr_rate_type_nm: "단리" } },
      expectedFact: "기간 정보",
    },
    {
      label: "missing rate",
      option: { save_trm: "18", intr_rate: null, intr_rate2: null, raw: { intr_rate_type_nm: "단리" } },
      expectedFact: "적용 가능한 금리 정보",
    },
  ])("fails closed for $label instead of calculating with 12 months or 0%", ({ option, expectedFact }) => {
    const invalidProduct: NormalizedProduct = {
      ...product,
      options: [option],
      best: undefined,
    };
    const rows = buildProductDetailOptionRows({
      kind: "deposit",
      options: invalidProduct.options,
      optionFields: FINLIFE_FIELD_CONFIG.deposit?.optionFields,
    });
    const html = renderDrawer(invalidProduct, option);

    expect(rows[0].isCalculable).toBe(false);
    expect(html).toContain("계산 기준을 확인하지 못했습니다.");
    expect(html).toContain(expectedFact);
    expect(html).not.toContain("예상 수령액");
    expect(html).not.toContain('data-selected-option-rate="0"');
  });

  it.each(["6~12개월", "1년이상~3년이하", "12개월", "1.5"])(
    "rejects ambiguous or non-month-only term %s",
    (term) => {
      expect(parseProductDetailTerm(term)).toBeNull();
    },
  );

  it("keeps base-only and prime-only choices exact without cross fallback", () => {
    const baseOnly = {
      save_trm: "12",
      intr_rate: 3.1,
      intr_rate2: null,
      raw: { intr_rate_type_nm: "단리" },
    };
    const primeOnly = {
      save_trm: "12",
      intr_rate: null,
      intr_rate2: 3.8,
      raw: { intr_rate_type_nm: "단리" },
    };
    const baseRows = buildProductDetailOptionRows({ kind: "deposit", options: [baseOnly] });
    const primeRows = buildProductDetailOptionRows({ kind: "deposit", options: [primeOnly] });

    expect(pickProductDetailRate(baseRows[0], "base")).toBe(3.1);
    expect(pickProductDetailRate(baseRows[0], "prime")).toBeNull();
    expect(pickProductDetailRate(primeRows[0], "prime")).toBe(3.8);
    expect(pickProductDetailRate(primeRows[0], "base")).toBeNull();

    const baseHtml = renderDrawer({ ...product, options: [baseOnly], best: undefined }, baseOnly);
    const primeHtml = renderDrawer({ ...product, options: [primeOnly], best: undefined }, primeOnly);
    expect(baseHtml).toContain('<option value="base" selected="">기본금리</option>');
    expect(baseHtml).not.toContain('<option value="prime"');
    expect(primeHtml).toContain('<option value="prime" selected="">최고금리</option>');
    expect(primeHtml).not.toContain('<option value="base"');
  });

  it("uses the disclosed simple or compound method and holds unknown methods", () => {
    const simpleOption = {
      save_trm: "24",
      intr_rate: 5,
      intr_rate2: null,
      raw: { intr_rate_type_nm: "단리" },
    };
    const compoundOption = {
      ...simpleOption,
      raw: { intr_rate_type_nm: "복리" },
    };
    const unknownOption = {
      ...simpleOption,
      raw: { intr_rate_type_nm: "혼합" },
    };
    const simpleExpected = calcDeposit({
      principalWon: 10_000_000,
      months: 24,
      annualRatePct: 5,
      taxRatePct: 15.4,
      interestType: "simple",
    });
    const compoundExpected = calcDeposit({
      principalWon: 10_000_000,
      months: 24,
      annualRatePct: 5,
      taxRatePct: 15.4,
      interestType: "compound",
    });

    const simpleHtml = renderDrawer({ ...product, options: [simpleOption], best: undefined }, simpleOption);
    const compoundHtml = renderDrawer({ ...product, options: [compoundOption], best: undefined }, compoundOption);
    const unknownHtml = renderDrawer({ ...product, options: [unknownOption], best: undefined }, unknownOption);
    expect(simpleHtml).toContain(formatKrwWithEok(simpleExpected.maturityWon));
    expect(compoundHtml).toContain(formatKrwWithEok(compoundExpected.maturityWon));
    expect(simpleExpected.maturityWon).not.toBe(compoundExpected.maturityWon);
    expect(unknownHtml).toContain("이자 계산 방식");
    expect(unknownHtml).not.toContain("예상 수령액");
  });

  it("does not rank an ambiguous term as a numeric month value", () => {
    const selected = selectBestOption({
      ...product,
      options: [
        { save_trm: "6~12개월", intr_rate: 9, intr_rate2: 9, raw: { intr_rate_type_nm: "단리" } },
        { save_trm: "24", intr_rate: 3.2, intr_rate2: 3.7, raw: { intr_rate_type_nm: "단리" } },
      ],
      best: undefined,
    }, {
      purpose: "seed-money",
      kind: "deposit",
      preferredTerm: 12,
      liquidityPref: "mid",
      rateMode: "max",
      topN: 10,
    });

    expect(selected).toMatchObject({ saveTrm: "24", termMonths: 24, appliedRate: 3.7 });
  });
});
