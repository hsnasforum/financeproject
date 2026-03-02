import { describe, expect, it } from "vitest";
import {
  formatKrwUnit,
  formatMonthsUnit,
  formatPercentUnit,
  hasActionCatalog,
  hasWarningCatalog,
  listWarningCatalogCodes,
  PLANNING_EMITTED_WARNING_CODES,
  PLANNING_WARNING_UNKNOWN_WHITELIST,
  renderCopyTemplate,
  resolveWarningCatalog,
  templateIds,
} from "../../../src/lib/planning/catalog";

describe("planning catalog SSOT", () => {
  it("maps every emitted warning code or explicitly whitelists it as unknown", () => {
    const unknownWhitelist = new Set<string>(PLANNING_WARNING_UNKNOWN_WHITELIST);
    for (const code of PLANNING_EMITTED_WARNING_CODES) {
      expect(hasWarningCatalog(code) || unknownWhitelist.has(code)).toBe(true);
    }
  });

  it("ensures every suggested action id exists in action catalog", () => {
    for (const code of listWarningCatalogCodes()) {
      const warning = resolveWarningCatalog(code);
      if (!warning.suggestedActionId) continue;
      expect(hasActionCatalog(warning.suggestedActionId)).toBe(true);
    }
  });

  it("renders copy templates without missing placeholders and includes required units", () => {
    const rendered = templateIds().map((id) => renderCopyTemplate(id, {
      code: "TEST_CODE",
      value: "123",
    }));
    for (const text of rendered) {
      expect(text).not.toMatch(/\{\{[a-zA-Z0-9_]+\}\}/);
    }

    expect(formatPercentUnit(4.8)).toContain("%");
    expect(formatKrwUnit(5_100_000)).toContain("KRW");
    expect(formatMonthsUnit(12)).toContain("months");
  });
});

