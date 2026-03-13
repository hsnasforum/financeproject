import { afterEach, describe, expect, it } from "vitest";
import { GET as companyGET } from "../src/app/api/public/disclosure/company/route";

describe("disclosure company route", () => {
  const originalFixture = process.env.DART_E2E_FIXTURE;

  afterEach(() => {
    if (typeof originalFixture === "string") {
      process.env.DART_E2E_FIXTURE = originalFixture;
    } else {
      delete process.env.DART_E2E_FIXTURE;
    }
  });

  it("rejects invalid corpCode formats before calling upstream", async () => {
    const response = await companyGET(new Request("http://localhost/api/public/disclosure/company?corpCode=bad-code"));
    const payload = await response.json() as { ok?: boolean; error?: { code?: string; message?: string } };

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INPUT");
    expect(payload.error?.message).toContain("corpCode 형식");
  });

  it("serves fixture data when the corpCode format is valid", async () => {
    process.env.DART_E2E_FIXTURE = "1";

    const response = await companyGET(new Request("http://localhost/api/public/disclosure/company?corpCode=00126380"));
    const payload = await response.json() as {
      ok?: boolean;
      data?: { corpCode?: string; corpName?: string };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.corpCode).toBe("00126380");
    expect(payload.data?.corpName).toBe("삼성전자");
  });
});
