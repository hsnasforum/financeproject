import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDartCompanyResponse } from "../src/lib/publicApis/dart/apiSchema";

describe("parseDartCompanyResponse fixture", () => {
  it("parses company sample fixture", () => {
    const fixturePath = path.join(process.cwd(), "tests", "fixtures", "dart", "company.sample.json");
    const payload = JSON.parse(fs.readFileSync(fixturePath, "utf-8")) as unknown;
    const parsed = parseDartCompanyResponse(payload);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.corp_code).toBe("00126380");
      expect(parsed.data.corp_name).toBe("삼성전자");
      expect(parsed.data.stock_code).toBe("005930");
      expect(parsed.data.ceo_nm).toBe("한종희");
      expect(parsed.data.raw.status).toBe("000");
    }
  });
});
