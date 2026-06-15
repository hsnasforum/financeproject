import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { getHousingSalesBenchmark } from "../src/lib/publicApis/providers/housing";

const originalEnv = {
  MOLIT_SALES_API_KEY: process.env.MOLIT_SALES_API_KEY,
  MOLIT_SALES_API_URL: process.env.MOLIT_SALES_API_URL,
  PUBLIC_APIS_FALLBACK_TO_MOCK: process.env.PUBLIC_APIS_FALLBACK_TO_MOCK,
};

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") reject(new Error("server address unavailable"));
      else resolve(address.port);
    });
  });
}

function saleXml(amount = "100,000"): string {
  return [
    "<response>",
    "<header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header>",
    `<body><items><item><excluUseAr>84.9</excluUseAr><dealAmount>${amount}</dealAmount></item></items></body>`,
    "</response>",
  ].join("");
}

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (typeof value === "string") process.env[key] = value;
    else delete process.env[key];
  }
});

describe("housing public API provider", () => {
  it("uses the Dev operation name when MOLIT sales base URL points at RTMSDataSvcAptTradeDev", async () => {
    let requestedPath = "";
    const server = http.createServer((request, response) => {
      requestedPath = request.url ?? "";
      response.setHeader("content-type", "application/xml");
      response.end(saleXml());
    });
    const port = await listen(server);

    try {
      process.env.MOLIT_SALES_API_KEY = "test-key";
      process.env.MOLIT_SALES_API_URL = `http://127.0.0.1:${port}/1613000/RTMSDataSvcAptTradeDev`;
      process.env.PUBLIC_APIS_FALLBACK_TO_MOCK = "0";

      const result = await getHousingSalesBenchmark("11680", "202401", "84");

      expect(result.ok).toBe(true);
      expect(requestedPath).toContain("/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev");
      if (result.ok) {
        expect(result.data.count).toBe(1);
        expect(result.data.source).toBe("국토교통부");
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("falls back to the summary sales endpoint when the Dev detail endpoint rejects the key", async () => {
    const requestedPaths: string[] = [];
    const server = http.createServer((request, response) => {
      const requestedPath = request.url ?? "";
      requestedPaths.push(requestedPath);
      if (requestedPath.includes("/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev")) {
        response.statusCode = 403;
        response.end("Forbidden");
        return;
      }
      response.setHeader("content-type", "application/xml");
      response.end(saleXml("120,000"));
    });
    const port = await listen(server);

    try {
      process.env.MOLIT_SALES_API_KEY = "test-key";
      process.env.MOLIT_SALES_API_URL = `http://127.0.0.1:${port}/1613000/RTMSDataSvcAptTradeDev`;
      process.env.PUBLIC_APIS_FALLBACK_TO_MOCK = "0";

      const result = await getHousingSalesBenchmark("11680", "202401", "84");

      expect(result.ok).toBe(true);
      expect(requestedPaths).toEqual([
        expect.stringContaining("/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"),
        expect.stringContaining("/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"),
      ]);
      if (result.ok) {
        expect(result.data.count).toBe(1);
        expect(result.data.median).toBe(1_200_000_000);
        expect(result.data.source).toBe("국토교통부");
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
