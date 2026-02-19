import { describe, expect, it } from "vitest";
import {
  extractRentRowsFromRows,
  extractSaleAmountsFromRows,
  filterRowsByAreaBand,
  getMolitHeader,
  getMolitItems,
} from "../src/lib/publicApis/providers/molitNormalize";

describe("molit xml normalize", () => {
  it("parses sales xml and applies areaBand tolerance", () => {
    const xml = `
      <response>
        <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
        <body>
          <items>
            <item><거래금액>120,000</거래금액><전용면적>84.95</전용면적></item>
            <item><거래금액>90,000</거래금액><전용면적>59.97</전용면적></item>
          </items>
        </body>
      </response>
    `;

    const items = getMolitItems(xml);
    const filtered = filterRowsByAreaBand(items, "84");
    const amounts = extractSaleAmountsFromRows(filtered);

    expect(items).toHaveLength(2);
    expect(filtered).toHaveLength(1);
    expect(amounts).toEqual([120000]);
  });

  it("parses rent xml and keeps only 84-band rows", () => {
    const xml = `
      <response>
        <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
        <body>
          <items>
            <item><보증금액>30,000</보증금액><월세금액>120</월세금액><전용면적>84.11</전용면적></item>
            <item><보증금액>50,000</보증금액><월세금액>0</월세금액><전용면적>101.2</전용면적></item>
          </items>
        </body>
      </response>
    `;

    const items = getMolitItems(xml);
    const filtered = filterRowsByAreaBand(items, "84");
    const rows = extractRentRowsFromRows(filtered);

    expect(filtered).toHaveLength(1);
    expect(rows).toEqual([{ deposit: 30000, monthly: 120 }]);
  });

  it("decodes entities/cdata, handles self-closing tags, and blocks unsafe keys", () => {
    const xml = `
      <response>
        <header><resultCode>00</resultCode><resultMsg><![CDATA[NORMAL &amp; SAFE]]></resultMsg></header>
        <body>
          <items>
            <item>
              <법정동><![CDATA[논현&amp;역삼]]></법정동>
              <메모>&lt;샘플&gt; &#x41; &#65; &quot;x&quot; &apos;y&apos;</메모>
              <비고/>
              <__proto__>pollute</__proto__>
            </item>
          </items>
        </body>
      </response>
    `;

    const header = getMolitHeader(xml);
    const items = getMolitItems(xml) as Array<Record<string, unknown>>;

    expect(header.resultMsg).toBe("NORMAL & SAFE");
    expect(items).toHaveLength(1);
    expect(items[0]["법정동"]).toBe("논현&역삼");
    expect(items[0]["메모"]).toBe("<샘플> A A \"x\" 'y'");
    expect(items[0]["비고"]).toBe("");
    expect(Object.prototype.hasOwnProperty.call(items[0], "__proto__")).toBe(false);
    expect(({} as Record<string, unknown>).pollute).toBeUndefined();
  });

  it("uses fallback area-key patterns when AREA_KEYS do not match", () => {
    const rows = [
      { 거래금액: "100,000", exclusive_area: "84.4" },
      { 거래금액: "90,000", exclu_use_ar: "101.1" },
      { 거래금액: "80,000", memo_area: "2.5" },
    ];

    const filtered = filterRowsByAreaBand(rows, "84");
    const amounts = extractSaleAmountsFromRows(filtered);

    expect(filtered).toHaveLength(1);
    expect(amounts).toEqual([100000]);
  });
});
