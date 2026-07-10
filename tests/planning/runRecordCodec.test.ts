import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  readJsonFile,
  readJsonFileDetailed,
} from "../../src/lib/planning/store/runRecordCodec";

describe("planning run record codec json reads", () => {
  let root = "";

  afterEach(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = "";
  });

  it("distinguishes missing and malformed json while preserving the nullable wrapper", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-run-record-codec-"));
    const missingPath = path.join(root, "missing.json");
    const malformedPath = path.join(root, "malformed.json");
    const readablePath = path.join(root, "readable.json");
    fs.writeFileSync(malformedPath, "{not-json", "utf8");
    fs.writeFileSync(readablePath, "false\n", "utf8");

    await expect(readJsonFileDetailed(missingPath)).resolves.toEqual({ status: "missing" });
    await expect(readJsonFileDetailed(malformedPath)).resolves.toEqual({ status: "invalid-json" });
    await expect(readJsonFileDetailed(readablePath)).resolves.toEqual({
      status: "found",
      value: false,
    });

    await expect(readJsonFile(missingPath)).resolves.toBeNull();
    await expect(readJsonFile(malformedPath)).resolves.toBeNull();
    await expect(readJsonFile(readablePath)).resolves.toBe(false);
  });
});
