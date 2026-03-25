import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockedBatchesStore = vi.hoisted(() => ({
  importCsvToBatch: vi.fn(),
  getBatchSummary: vi.fn(),
}));

vi.mock("../src/lib/planning/v3/batches/store", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/planning/v3/batches/store")>(
    "../src/lib/planning/v3/batches/store",
  );
  mockedBatchesStore.importCsvToBatch.mockImplementation(actual.importCsvToBatch);
  mockedBatchesStore.getBatchSummary.mockImplementation(actual.getBatchSummary);
  return {
    ...actual,
    importCsvToBatch: mockedBatchesStore.importCsvToBatch,
    getBatchSummary: mockedBatchesStore.getBatchSummary,
  };
});

import { POST as importCsvPOST } from "../src/app/api/planning/v3/batches/import/csv/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:5120";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const REMOTE_HOST = "example.com";
const REMOTE_ORIGIN = `http://${REMOTE_HOST}`;
const EVIL_ORIGIN = "http://evil.com";

function requestMultipart(
  fileText?: string,
  fileName = "sample.csv",
  options?: {
    requestOrigin?: string;
    host?: string;
    origin?: string;
    refererOrigin?: string;
  },
): Request {
  const form = new FormData();
  if (typeof fileText === "string") {
    form.append("file", new File([fileText], fileName, { type: "text/csv" }));
  }
  form.append("csrf", "test");
  const requestOrigin = options?.requestOrigin ?? LOCAL_ORIGIN;
  const host = options?.host ?? new URL(requestOrigin).host;
  const origin = options?.origin ?? requestOrigin;
  const refererOrigin = options?.refererOrigin ?? origin;
  return new Request(`${requestOrigin}/api/planning/v3/batches/import/csv`, {
    method: "POST",
    headers: {
      host,
      origin,
      referer: `${refererOrigin}/planning/v3/import/csv`,
    },
    body: form,
  });
}

function requestJson(
  body: unknown,
  options?: {
    requestOrigin?: string;
    host?: string;
    origin?: string;
    refererOrigin?: string;
  },
): Request {
  const requestOrigin = options?.requestOrigin ?? LOCAL_ORIGIN;
  const host = options?.host ?? new URL(requestOrigin).host;
  const origin = options?.origin ?? requestOrigin;
  const refererOrigin = options?.refererOrigin ?? origin;
  return new Request(`${requestOrigin}/api/planning/v3/batches/import/csv`, {
    method: "POST",
    headers: {
      host,
      origin,
      referer: `${refererOrigin}/planning/v3/import/csv`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function requestText(
  csvText: string,
  options?: {
    requestOrigin?: string;
    host?: string;
    origin?: string;
    refererOrigin?: string;
  },
): Request {
  const requestOrigin = options?.requestOrigin ?? LOCAL_ORIGIN;
  const host = options?.host ?? new URL(requestOrigin).host;
  const origin = options?.origin ?? requestOrigin;
  const refererOrigin = options?.refererOrigin ?? origin;
  return new Request(`${requestOrigin}/api/planning/v3/batches/import/csv`, {
    method: "POST",
    headers: {
      host,
      origin,
      referer: `${refererOrigin}/planning/v3/import/csv`,
      "content-type": "text/csv",
    },
    body: csvText,
  });
}

async function expectOriginMismatch(response: Response | Promise<Response>) {
  const resolved = await response;
  expect(resolved.status).toBe(403);
  const payload = await resolved.json() as { ok?: boolean; error?: { code?: string } };
  expect(payload.ok).toBe(false);
  expect(payload.error?.code).toBe("ORIGIN_MISMATCH");
}

function collectKeys(value: unknown, parent = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectKeys(entry, `${parent}[${index}]`));
  }
  if (!value || typeof value !== "object") return [];

  const rows: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const pathKey = parent ? `${parent}.${key}` : key;
    rows.push(pathKey);
    rows.push(...collectKeys(child, pathKey));
  }
  return rows;
}

describe("POST /api/planning/v3/batches/import/csv", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-batches-import-csv-api-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
    mockedBatchesStore.importCsvToBatch.mockClear();
    mockedBatchesStore.getBatchSummary.mockClear();
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns 400 when file is missing", async () => {
    const response = await importCsvPOST(requestMultipart());
    expect(response.status).toBe(400);
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INPUT");
  });

  it("forwards trusted multipart File.name into importCsvToBatch provenance handoff", async () => {
    const csvText = [
      "date,amount,description",
      "2026-03-01,1000,alpha",
    ].join("\n");

    const response = await importCsvPOST(requestMultipart(csvText, "trusted-import.csv"));
    expect(response.status).toBe(201);
    expect(mockedBatchesStore.importCsvToBatch).toHaveBeenCalledWith(expect.objectContaining({
      csvText,
      sanitizeTextFields: true,
      provenance: { fileName: "trusted-import.csv" },
    }));

    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        batchId?: string;
        createdAt?: string;
      };
    };
    expect(payload.ok).toBe(true);
    expect(typeof payload.data?.batchId).toBe("string");
    expect(typeof payload.data?.createdAt).toBe("string");

    const keyText = collectKeys(payload).join("\n").toLowerCase();
    expect(keyText.includes("sourcebinding")).toBe(false);
    expect(keyText.includes("artifactsha256")).toBe(false);
    expect(keyText.includes("attestedfilename")).toBe(false);
    expect(keyText.includes("originkind")).toBe(false);
  });

  it("keeps json fileName optional and leaves text payload provenance blank", async () => {
    const csvText = [
      "date,amount,description",
      "2026-03-01,1000,alpha",
    ].join("\n");

    const jsonResponse = await importCsvPOST(requestJson({
      csvText,
      fileName: "json-import.csv",
      csrf: "test",
    }));
    expect(jsonResponse.status).toBe(201);
    expect(mockedBatchesStore.importCsvToBatch).toHaveBeenLastCalledWith(expect.objectContaining({
      csvText,
      sanitizeTextFields: true,
      provenance: { fileName: "json-import.csv" },
    }));

    mockedBatchesStore.importCsvToBatch.mockClear();

    const textResponse = await importCsvPOST(requestText(csvText));
    expect(textResponse.status).toBe(201);
    expect(mockedBatchesStore.importCsvToBatch).toHaveBeenLastCalledWith(expect.objectContaining({
      csvText,
      sanitizeTextFields: true,
    }));
    const lastCall = mockedBatchesStore.importCsvToBatch.mock.calls.at(-1)?.[0] as
      | { provenance?: { fileName?: string } }
      | undefined;
    expect(lastCall?.provenance).toBeUndefined();
  });

  it("normalizes blank json fileName to omitted provenance without widening the response", async () => {
    const csvText = [
      "date,amount,description",
      "2026-03-01,1000,alpha",
    ].join("\n");

    const response = await importCsvPOST(requestJson({
      csvText,
      fileName: "   ",
      csrf: "test",
    }));

    expect(response.status).toBe(201);
    expect(mockedBatchesStore.importCsvToBatch).toHaveBeenLastCalledWith(expect.objectContaining({
      csvText,
      sanitizeTextFields: true,
    }));
    const lastCall = mockedBatchesStore.importCsvToBatch.mock.calls.at(-1)?.[0] as
      | { provenance?: { fileName?: string } }
      | undefined;
    expect(lastCall?.provenance).toBeUndefined();

    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        batchId?: string;
        createdAt?: string;
        summary?: {
          months?: number;
          txns?: number;
          transfers?: number;
          unassignedCategory?: number;
        };
      };
    };
    expect(payload.ok).toBe(true);
    expect(typeof payload.data?.batchId).toBe("string");
    expect(typeof payload.data?.createdAt).toBe("string");
    expect(typeof payload.data?.summary?.months).toBe("number");
    expect(typeof payload.data?.summary?.txns).toBe("number");
    expect(typeof payload.data?.summary?.transfers).toBe("number");
    expect(typeof payload.data?.summary?.unassignedCategory).toBe("number");

    const keyText = collectKeys(payload).join("\n").toLowerCase();
    expect(keyText.includes("provenance")).toBe(false);
    expect(keyText.includes("importmetadata")).toBe(false);
    expect(keyText.includes("metadatahandoff")).toBe(false);
    expect(keyText.includes("filenameprovided")).toBe(false);
    expect(keyText.includes("sourcebinding")).toBe(false);
    expect(keyText.includes("artifactsha256")).toBe(false);
    expect(keyText.includes("attestedfilename")).toBe(false);
    expect(keyText.includes("originkind")).toBe(false);
  });

  it("uploads csv and returns batchId with summary shape", async () => {
    const response = await importCsvPOST(requestMultipart([
      "date,amount,description",
      "2026-03-01,3000000,salary",
      "2026-03-02,-1200000,rent",
      "2026-03-03,-500000,transfer out",
      "2026-03-03,500000,transfer in",
    ].join("\n")));

    expect(response.status).toBe(201);
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        batchId?: string;
        createdAt?: string;
        summary?: {
          months?: number;
          txns?: number;
          transfers?: number;
          unassignedCategory?: number;
        };
      };
    };
    expect(payload.ok).toBe(true);
    expect(typeof payload.data?.batchId).toBe("string");
    expect(typeof payload.data?.createdAt).toBe("string");
    expect(typeof payload.data?.summary?.months).toBe("number");
    expect(typeof payload.data?.summary?.txns).toBe("number");
    expect(typeof payload.data?.summary?.transfers).toBe("number");
    expect(typeof payload.data?.summary?.unassignedCategory).toBe("number");
  });

  it("stores batch file without forbidden raw string keys", async () => {
    const response = await importCsvPOST(requestMultipart([
      "date,amount,description",
      "2026-03-01,1000,SECRET_PII_SHOULD_NOT_LEAK",
      "2026-03-02,-300,카페 결제",
    ].join("\n")));
    expect(response.status).toBe(201);
    const payload = await response.json() as { data?: { batchId?: string } };
    const batchId = String(payload.data?.batchId ?? "");
    expect(batchId.length).toBeGreaterThan(0);

    const filePath = path.join(root, "planning-v3", "batches", `${batchId}.ndjson`);
    const raw = fs.readFileSync(filePath, "utf-8");
    const rows = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as unknown);
    const keyText = collectKeys(rows).join("\n").toLowerCase();
    expect(keyText.includes("description")).toBe(false);
    expect(keyText.includes("desc")).toBe(false);
    expect(keyText.includes("merchant")).toBe(false);
    expect(keyText.includes("rawline")).toBe(false);
    expect(keyText.includes("originalcsv")).toBe(false);
    expect(keyText.includes("memo")).toBe(false);
    expect(raw.includes("SECRET_PII_SHOULD_NOT_LEAK")).toBe(false);
  });

  it("returns same batchId for same csv input", async () => {
    const csvText = [
      "date,amount,description",
      "2026-03-01,1000,alpha",
      "2026-03-02,-300,beta",
    ].join("\n");
    const first = await importCsvPOST(requestMultipart(csvText));
    const second = await importCsvPOST(requestMultipart(csvText));
    const firstPayload = await first.json() as { data?: { batchId?: string } };
    const secondPayload = await second.json() as { data?: { batchId?: string } };
    expect(firstPayload.data?.batchId).toBe(secondPayload.data?.batchId);
  });

  it("allows same-origin remote host and still blocks cross-origin", async () => {
    const csvText = [
      "date,amount,description",
      "2026-03-01,1000,alpha",
      "2026-03-02,-300,beta",
    ].join("\n");

    const sameOrigin = await importCsvPOST(requestMultipart(
      csvText,
      "remote.csv",
      { requestOrigin: REMOTE_ORIGIN, host: REMOTE_HOST },
    ));
    expect(sameOrigin.status).toBe(201);
    const sameOriginPayload = await sameOrigin.json() as {
      ok?: boolean;
      data?: { batchId?: string };
    };
    expect(sameOriginPayload.ok).toBe(true);
    expect(typeof sameOriginPayload.data?.batchId).toBe("string");

    await expectOriginMismatch(importCsvPOST(requestMultipart(
      csvText,
      "remote.csv",
      {
        requestOrigin: REMOTE_ORIGIN,
        host: REMOTE_HOST,
        origin: EVIL_ORIGIN,
        refererOrigin: EVIL_ORIGIN,
      },
    )));
  });
});
