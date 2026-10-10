import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { diffSchemaFingerprint } from "../src/lib/dataQuality/schemaDiff";
import { createSchemaFingerprint, type SchemaFingerprint } from "../src/lib/dataQuality/schemaFingerprint";

const baseline = JSON.parse(fs.readFileSync(
  new URL("../docs/schema-baselines.json", import.meta.url), "utf8",
)) as { snapshots: Record<string, SchemaFingerprint> };

describe("approved FINLIFE loan snapshot schema contracts", () => {
  it.each(["credit-loan", "mortgage-loan", "rent-house-loan"])(
    "%s retains collection diagnostics and the approved source schema",
    (kind) => {
      const filename = `finlife_${kind}_snapshot.json`;
      const snapshot = JSON.parse(fs.readFileSync(new URL(`../.data/${filename}`, import.meta.url), "utf8"));
      const expected = baseline.snapshots[filename];
      expect(expected).toBeDefined();
      const actual = createSchemaFingerprint(snapshot, expected);
      expect(diffSchemaFingerprint(expected, actual).breaking).toEqual([]);
    },
  );

  // The official JSON example contains null, while captured responses and
  // older approved snapshots also contain date strings. Check both if a future
  // snapshot's first three sampled products happen to contain only null.
  it.each([null, "20260930"])("accepts the official credit disclosure end day %s", (endDay) => {
    const path = "$.items[].raw.dcls_end_day";
    const expected = baseline.snapshots["finlife_credit-loan_snapshot.json"];
    const entry = expected.entries.find((item) => item.path === path);
    expect(entry).toBeDefined();
    const actual = createSchemaFingerprint({ items: [{ raw: { dcls_end_day: endDay } }] });
    expect(diffSchemaFingerprint(
      { ...expected, entries: entry ? [entry] : [] },
      { ...actual, entries: actual.entries.filter((item) => item.path === path) },
    ).breaking).toEqual([]);
  });
});
