import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importCsvToBatch } from "../src/lib/planning/v3/service/importCsvToBatch";
import {
  deleteBatch,
  getBatchMeta,
  getBatchTransactions,
  listBatches,
} from "../src/lib/planning/v3/store/batchesStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
}

function hashSha256(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

describe("planning v3 batchesStore/importCsvToBatch", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-batches-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("creates deterministic batchId and txnIds for the same csv input", async () => {
    const csvText = [
      "date,amount,description",
      "2026-03-01,1500000,salary",
      "2026-03-02,-50000,coffee",
    ].join("\n");

    const first = await importCsvToBatch({ csvText });
    const second = await importCsvToBatch({ csvText });

    expect(first.batchMeta.id).toBe(second.batchMeta.id);
    expect(first.transactions.map((row) => row.txnId)).toEqual(second.transactions.map((row) => row.txnId));
    expect((await listBatches()).length).toBe(1);
  });

  it("dedupes rows by normalized txnId rule inside one batch", async () => {
    const csvText = [
      "date,amount,description",
      "2026-03-01,-12000,Coffee  Shop!!",
      "2026-03-01,-12000, coffee shop ",
    ].join("\n");

    const imported = await importCsvToBatch({
      csvText,
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
    });

    expect(imported.transactions).toHaveLength(1);
    expect(imported.batchMeta.rowCount).toBe(1);
  });

  it("stores index.json in deterministic id-sorted order", async () => {
    await importCsvToBatch({
      csvText: ["date,amount,description", "2026-01-01,1000,a"].join("\n"),
    });
    await importCsvToBatch({
      csvText: ["date,amount,description", "2026-02-01,2000,b"].join("\n"),
    });

    const listed = await listBatches();
    const listedIds = listed.map((row) => row.id);
    const sortedIds = [...listedIds].sort((left, right) => left.localeCompare(right));
    expect(listedIds).toEqual(sortedIds);

    const indexPath = path.join(root, "planning-v3", "batches", "index.json");
    const parsed = readJson(indexPath) as {
      version?: number;
      items?: Array<{ id?: string }>;
    };
    expect(parsed.version).toBe(1);
    const fileIds = (parsed.items ?? []).map((row) => String(row.id ?? ""));
    expect(fileIds).toEqual([...fileIds].sort((left, right) => left.localeCompare(right)));
  });

  it("persists batch-level diagnostics/provenance metadata without touching row schema", async () => {
    const csvText = [
      "거래일,금액,적요",
      "2026/03/01,1000000,급여",
      "2026.13.01,100,잘못된날짜",
      "2026-03-03,abc,잘못된금액",
      "2026-03-04,\"(123,000)\",관리비",
    ].join("\n");

    const imported = await importCsvToBatch({
      csvText,
      provenance: { fileName: "handoff-bootstrap.csv" },
    });

    expect(imported.metadataHandoff).toEqual({
      diagnostics: {
        rows: 4,
        parsed: 2,
        skipped: 2,
      },
      provenance: {
        fileNameProvided: true,
        fileName: "handoff-bootstrap.csv",
      },
      sourceBinding: {
        artifactSha256: hashSha256(csvText),
        attestedFileName: "handoff-bootstrap.csv",
        originKind: "writer-handoff",
      },
    });
    expect((imported.batchMeta as Record<string, unknown>).importMetadata).toBeUndefined();

    const storedMeta = await getBatchMeta(imported.batchMeta.id);
    expect(storedMeta).toMatchObject({
      id: imported.batchMeta.id,
      rowCount: 2,
      importMetadata: {
        diagnostics: {
          rows: 4,
          parsed: 2,
          skipped: 2,
        },
        provenance: {
          fileNameProvided: true,
          fileName: "handoff-bootstrap.csv",
        },
        sourceBinding: {
          artifactSha256: hashSha256(csvText),
          attestedFileName: "handoff-bootstrap.csv",
          originKind: "writer-handoff",
        },
      },
    });

    const listedMeta = (await listBatches()).find((row) => row.id === imported.batchMeta.id);
    expect(listedMeta?.importMetadata).toEqual(storedMeta?.importMetadata);

    const indexPath = path.join(root, "planning-v3", "batches", "index.json");
    const parsedIndex = readJson(indexPath) as {
      items?: Array<Record<string, unknown>>;
    };
    const savedItem = (parsedIndex.items ?? []).find((row) => row.id === imported.batchMeta.id) ?? {};
    expect(savedItem.importMetadata).toEqual({
      diagnostics: {
        rows: 4,
        parsed: 2,
        skipped: 2,
      },
      provenance: {
        fileNameProvided: true,
        fileName: "handoff-bootstrap.csv",
      },
      sourceBinding: {
        artifactSha256: hashSha256(csvText),
        attestedFileName: "handoff-bootstrap.csv",
        originKind: "writer-handoff",
      },
    });

    const batchFilePath = path.join(root, "planning-v3", "batches", `${imported.batchMeta.id}.ndjson`);
    const raw = fs.readFileSync(batchFilePath, "utf-8");
    const storedRows = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(raw.includes("handoff-bootstrap.csv")).toBe(false);
    expect(storedRows.every((row) => row.fileName === undefined && row.diagnostics === undefined && row.provenance === undefined && row.importMetadata === undefined)).toBe(true);
  });

  it("stores fileNameProvided false when provenance is omitted", async () => {
    const imported = await importCsvToBatch({
      csvText: [
        "date,amount,description",
        "2026-03-01,1000000,salary",
        "2026-03-02,-15000,coffee",
      ].join("\n"),
    });

    expect(imported.metadataHandoff).toEqual({
      diagnostics: {
        rows: 2,
        parsed: 2,
        skipped: 0,
      },
      provenance: {
        fileNameProvided: false,
      },
    });
    expect((imported.batchMeta as Record<string, unknown>).importMetadata).toBeUndefined();

    const storedMeta = await getBatchMeta(imported.batchMeta.id);
    expect(storedMeta?.importMetadata).toEqual({
      diagnostics: {
        rows: 2,
        parsed: 2,
        skipped: 0,
      },
      provenance: {
        fileNameProvided: false,
      },
    });
    expect(storedMeta?.importMetadata?.sourceBinding).toBeUndefined();

    const listedMeta = (await listBatches()).find((row) => row.id === imported.batchMeta.id);
    expect(listedMeta?.importMetadata).toEqual(storedMeta?.importMetadata);

    const indexPath = path.join(root, "planning-v3", "batches", "index.json");
    const parsedIndex = readJson(indexPath) as {
      items?: Array<Record<string, unknown>>;
    };
    const savedItem = (parsedIndex.items ?? []).find((row) => row.id === imported.batchMeta.id) ?? {};
    expect(savedItem.importMetadata).toEqual({
      diagnostics: {
        rows: 2,
        parsed: 2,
        skipped: 0,
      },
      provenance: {
        fileNameProvided: false,
      },
    });
  });

  it("normalizes blank provenance fileName into fileNameProvided false", async () => {
    const imported = await importCsvToBatch({
      csvText: [
        "date,amount,description",
        "2026-03-01,1000000,salary",
        "2026-03-02,-15000,coffee",
      ].join("\n"),
      provenance: { fileName: "   " },
    });

    expect(imported.metadataHandoff).toEqual({
      diagnostics: {
        rows: 2,
        parsed: 2,
        skipped: 0,
      },
      provenance: {
        fileNameProvided: false,
      },
    });
    expect((imported.batchMeta as Record<string, unknown>).importMetadata).toBeUndefined();

    const storedMeta = await getBatchMeta(imported.batchMeta.id);
    expect(storedMeta?.importMetadata).toEqual({
      diagnostics: {
        rows: 2,
        parsed: 2,
        skipped: 0,
      },
      provenance: {
        fileNameProvided: false,
      },
    });
    expect(storedMeta?.importMetadata?.sourceBinding).toBeUndefined();

    const listedMeta = (await listBatches()).find((row) => row.id === imported.batchMeta.id);
    expect(listedMeta?.importMetadata).toEqual(storedMeta?.importMetadata);

    const indexPath = path.join(root, "planning-v3", "batches", "index.json");
    const parsedIndex = readJson(indexPath) as {
      items?: Array<Record<string, unknown>>;
    };
    const savedItem = (parsedIndex.items ?? []).find((row) => row.id === imported.batchMeta.id) ?? {};
    expect(savedItem.importMetadata).toEqual({
      diagnostics: {
        rows: 2,
        parsed: 2,
        skipped: 0,
      },
      provenance: {
        fileNameProvided: false,
      },
    });
  });

  it("supports meta + transactions roundtrip", async () => {
    const imported = await importCsvToBatch({
      csvText: [
        "date,amount,description",
        "2026-04-01,1000000,급여",
        "2026-04-02,-25000,점심",
      ].join("\n"),
      options: { accountId: "acc-main", accountName: "주거래" },
    });

    const [meta, rows] = await Promise.all([
      getBatchMeta(imported.batchMeta.id),
      getBatchTransactions(imported.batchMeta.id),
    ]);

    expect(meta?.id).toBe(imported.batchMeta.id);
    expect(meta?.accounts?.[0]?.id).toBe("acc-main");
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.batchId === imported.batchMeta.id)).toBe(true);
  });

  it("deleteBatch removes index entry and transaction file", async () => {
    const imported = await importCsvToBatch({
      csvText: ["date,amount,description", "2026-05-01,1000,a"].join("\n"),
    });
    const filePath = path.join(root, "planning-v3", "batches", `${imported.batchMeta.id}.ndjson`);
    expect(fs.existsSync(filePath)).toBe(true);

    await deleteBatch(imported.batchMeta.id);

    expect(await getBatchMeta(imported.batchMeta.id)).toBeNull();
    expect(await getBatchTransactions(imported.batchMeta.id)).toEqual([]);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it("has no console usage in PR60 store/service files", () => {
    const targets = [
      path.join(process.cwd(), "src/lib/planning/v3/store/batchesStore.ts"),
      path.join(process.cwd(), "src/lib/planning/v3/service/importCsvToBatch.ts"),
    ];

    for (const target of targets) {
      const text = fs.readFileSync(target, "utf-8");
      expect(text).not.toMatch(/\bconsole\./);
    }
  });
});
