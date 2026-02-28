import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectServerPaths } from "../src/lib/backup/exportPaths";
import { isServerPathWhitelisted } from "../src/lib/backup/backupBundle";

describe("backup export planning coverage", () => {
  let root = "";

  afterEach(() => {
    if (root) {
      fs.rmSync(root, { recursive: true, force: true });
      root = "";
    }
  });

  it("collects required planning paths and optional planning files when present", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-backup-export-"));

    fs.mkdirSync(path.join(root, ".data", "planning", "assumptions", "history"), { recursive: true });
    fs.mkdirSync(path.join(root, ".data", "planning", "profiles"), { recursive: true });
    fs.mkdirSync(path.join(root, ".data", "planning", "runs"), { recursive: true });
    fs.mkdirSync(path.join(root, ".data", "planning", "cache"), { recursive: true });
    fs.mkdirSync(path.join(root, ".data", "planning", "eval", "history"), { recursive: true });
    fs.mkdirSync(path.join(root, ".data", "planning", "share"), { recursive: true });

    fs.writeFileSync(path.join(root, ".data", "planning", "assumptions.latest.json"), "{\"version\":1}\n", "utf-8");
    fs.writeFileSync(path.join(root, ".data", "planning", "assumptions", "history", "s1.json"), "{\"version\":1}\n", "utf-8");
    fs.writeFileSync(path.join(root, ".data", "planning", "profiles", "p1.json"), "{\"version\":1}\n", "utf-8");
    fs.writeFileSync(path.join(root, ".data", "planning", "runs", "r1.json"), "{\"version\":1}\n", "utf-8");
    fs.writeFileSync(path.join(root, ".data", "planning", "cache", "simulate.a.json"), "{\"version\":1}\n", "utf-8");
    fs.writeFileSync(path.join(root, ".data", "planning", "eval", "latest.json"), "{\"version\":1}\n", "utf-8");
    fs.writeFileSync(path.join(root, ".data", "planning", "eval", "history", "2026-02-28.json"), "{\"version\":1}\n", "utf-8");
    fs.writeFileSync(path.join(root, ".data", "planning", "share", "share-1.md"), "# share\n", "utf-8");

    const paths = collectServerPaths(root);

    expect(paths).toContain(".data/planning/assumptions.latest.json");
    expect(paths).toContain(".data/planning/assumptions/history/s1.json");
    expect(paths).toContain(".data/planning/profiles/p1.json");
    expect(paths).toContain(".data/planning/runs/r1.json");
    expect(paths).toContain(".data/planning/cache/simulate.a.json");
    expect(paths).toContain(".data/planning/eval/latest.json");
    expect(paths).toContain(".data/planning/eval/history/2026-02-28.json");
    expect(paths).not.toContain(".data/planning/share/share-1.md");

    expect(paths.every((entry) => isServerPathWhitelisted(entry))).toBe(true);
  });
});
