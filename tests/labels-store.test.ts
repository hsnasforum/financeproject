import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadLabels, upsertLabel } from "../src/lib/dart/labelsStore";

const roots: string[] = [];
let previousLabelsPath: string | undefined;

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-labels-store-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

beforeEach(() => {
  previousLabelsPath = process.env.DART_LABELS_PATH;
});

afterEach(() => {
  if (typeof previousLabelsPath === "string") {
    process.env.DART_LABELS_PATH = previousLabelsPath;
  } else {
    delete process.env.DART_LABELS_PATH;
  }
});

describe("labels store", () => {
  it("loads empty labels and upserts rows", () => {
    const root = makeRoot();
    const labelsPath = path.join(root, "data", "dart", "labels.csv");
    process.env.DART_LABELS_PATH = labelsPath;

    const firstLoad = loadLabels();
    expect(firstLoad.size).toBe(0);
    expect(fs.existsSync(labelsPath)).toBe(true);

    upsertLabel({
      corpCode: "00126380",
      rceptDt: "20260226",
      reportNm: "유상증자 결정",
      label: "capital",
    });

    const secondLoad = loadLabels();
    expect(secondLoad.size).toBe(1);
    expect(secondLoad.get("00126380|20260226|유상증자 결정")).toBe("capital");
  });

  it("updates existing key without creating duplicates", () => {
    const root = makeRoot();
    const labelsPath = path.join(root, "data", "dart", "labels.csv");
    process.env.DART_LABELS_PATH = labelsPath;

    upsertLabel({
      corpCode: "00126380",
      rceptDt: "20260226",
      reportNm: "유상증자 결정",
      label: "capital",
    });
    upsertLabel({
      corpCode: "00126380",
      rceptDt: "20260226",
      reportNm: "유상증자 결정",
      label: "disposition",
    });

    const map = loadLabels();
    expect(map.size).toBe(1);
    expect(map.get("00126380|20260226|유상증자 결정")).toBe("disposition");

    const lines = fs.readFileSync(labelsPath, "utf-8").trimEnd().split("\n");
    expect(lines).toHaveLength(2);
  });
});
