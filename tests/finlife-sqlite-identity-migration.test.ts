import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createFinlifeLegacyFixture, snapshotDatabase } from "./helpers/finlifeLegacyDatabase";
import { inspectFinlifeIdentityMigration, migrateFinlifeIdentityDatabase } from "../src/lib/finlife/sqliteIdentityMigration.mjs";
import { acquirePlanningWriterLease } from "../src/lib/planning/deployment/writerLease.mjs";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function fixture(options: Parameters<typeof createFinlifeLegacyFixture>[1] = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finlife-migration-"));
  roots.push(root);
  const databasePath = path.join(root, "legacy.sqlite");
  createFinlifeLegacyFixture(databasePath, options);
  const controlRoot = path.join(root, "control");
  fs.mkdirSync(controlRoot);
  return { cwd: process.cwd(), databasePath, controlRoot };
}
async function apply(input: ReturnType<typeof fixture>) {
  const lease = await acquirePlanningWriterLease({ dataRoot: input.controlRoot, writerId: "finlife:identity:migrate:apply" });
  try { return await migrateFinlifeIdentityDatabase({ ...input, capability: lease.capability }); }
  finally { await lease.release(); }
}
function edit(file: string, fn: (db: Database) => void) {
  const db = new Database(file);
  try { fn(db); } finally { db.close(); }
}

describe("FINLIFE SQLite identity migration", () => {
  it("migrates real legacy unique schema without changing any existing row or reference, and restores the backup", async () => {
    const input = fixture();
    edit(input.databasePath, db => {
      expect(() => db.prepare('INSERT INTO Product (id,finPrdtCd,kind,providerId,updatedAt) VALUES (41,?,?,?,?)')
        .run("SHARED-CODE", "deposit", 11, "2026-10-01")).toThrow(/UNIQUE.*finPrdtCd/);
    });
    const before = snapshotDatabase(input.databasePath);
    expect(inspectFinlifeIdentityMigration(input)).toMatchObject({ status: "required", productCount: 1 });
    const result = await apply(input);
    if (!result.backupPath || !result.receiptPath) throw new Error("applied migration must report verified backup and receipt");
    expect(result).toMatchObject({ status: "ready", applied: true, productCount: 1 });
    expect(snapshotDatabase(input.databasePath, { omitIdentity: true })).toEqual(before);
    expect(snapshotDatabase(result.backupPath)).toEqual(before);
    const restored = path.join(input.controlRoot, "restored.sqlite");
    fs.copyFileSync(result.backupPath, restored);
    expect(inspectFinlifeIdentityMigration({ ...input, databasePath: restored }).status).toBe("required");
    expect(snapshotDatabase(restored)).toEqual(before);
    expect(JSON.parse(fs.readFileSync(result.receiptPath, "utf8"))).toMatchObject({ state: "applied" });
    expect(JSON.parse(fs.readFileSync(path.join(path.dirname(result.receiptPath), "prepared.json"), "utf8"))).toMatchObject({ state: "prepared" });
    expect(fs.statSync(result.backupPath).mode & 0o077).toBe(0);
    edit(input.databasePath, db => {
      expect(db.pragma("foreign_key_check")).toEqual([]);
      expect(db.prepare('SELECT id, identityKey FROM "Product"').get()).toEqual({ id: 40, identityKey: "finlife:deposit:0010001:SHARED-CODE" });
      expect(() => db.prepare('INSERT INTO "Product" (id,finPrdtCd,identityKey,kind,updatedAt) VALUES (41,?,?,?,?)')
        .run("SHARED-CODE", "finlife:deposit:0010002:SHARED-CODE", "deposit", "2026-10-01")).not.toThrow();
      expect(() => db.prepare('INSERT INTO "Product" (id,finPrdtCd,identityKey,kind,updatedAt) VALUES (42,?,?,?,?)')
        .run("DIFFERENT-CODE", "finlife:deposit:0010001:SHARED-CODE", "deposit", "2026-10-01")).toThrow(/UNIQUE/);
    });
  });

  it("preserves two different company IDs and references when old global uniqueness was already removed", async () => {
    const input = fixture({ globalUnique: false, secondCompany: true });
    const before = snapshotDatabase(input.databasePath);
    await apply(input);
    expect(snapshotDatabase(input.databasePath, { omitIdentity: true })).toEqual(before);
    edit(input.databasePath, db => expect(db.prepare('SELECT identityKey FROM Product ORDER BY id').all()).toEqual([
      { identityKey: "finlife:deposit:0010001:SHARED-CODE" }, { identityKey: "finlife:deposit:0010002:SHARED-CODE" },
    ]));
  });

  it("reruns as a read-only no-op without another backup or changed bytes", async () => {
    const input = fixture({ identityColumn: true });
    const result = await apply(input);
    if (!result.backupPath || !result.receiptPath) throw new Error("applied migration must report verified backup and receipt");
    const before = fs.readFileSync(input.databasePath);
    const receipt = fs.readFileSync(result.receiptPath);
    const second = await apply(input);
    expect(second).toMatchObject({ status: "ready", applied: false });
    expect(second.backupPath).toBeUndefined();
    expect(fs.readFileSync(input.databasePath)).toEqual(before);
    expect(fs.readFileSync(result.receiptPath)).toEqual(receipt);
  });

  it.each([
    ["missing raw company", (db: Database) => db.exec(`UPDATE Product SET raw=json_remove(raw,'$.fin_co_no')`)],
    ["provider conflict", (db: Database) => db.exec("UPDATE Product SET providerId=11")],
    ["generated legacy column", (db: Database) => db.exec("ALTER TABLE Product ADD COLUMN legacyLabel TEXT GENERATED ALWAYS AS (coalesce(name,'legacy')) VIRTUAL")],
    ["unknown compound unique index", (db: Database) => db.exec("CREATE UNIQUE INDEX custom_kind_code ON Product(kind,finPrdtCd)")],
    ["unknown expression unique index", (db: Database) => db.exec("CREATE UNIQUE INDEX custom_lower_code ON Product(lower(finPrdtCd))")],
    ["wrong saved kind", (db: Database) => db.exec("UPDATE Product SET kind='saving'")],
    ["missing option kind evidence", (db: Database) => db.exec("DELETE FROM ProductOption")],
    ["unsupported older user schema", (db: Database) => db.exec("ALTER TABLE User DROP COLUMN image")],
    ["unresolved kind", (db: Database) => db.exec("UPDATE Product SET kind='unknown'")],
    ["wrong option company", (db: Database) => db.exec(`UPDATE ProductOption SET raw=json_set(raw,'$.fin_co_no','0010002')`)],
    ["wrong option month", (db: Database) => db.exec(`UPDATE ProductOption SET raw=json_set(raw,'$.dcls_month','202608')`)],
    ["invalid raw JSON", (db: Database) => db.exec("UPDATE Product SET raw='not-json'")],
    ["duplicate option", (db: Database) => db.exec("INSERT INTO ProductOption (productId,raw) SELECT productId,raw FROM ProductOption")],
    ["duplicate scoped product", (db: Database) => {
      db.exec("DROP INDEX Product_finPrdtCd_key; INSERT INTO Product (finPrdtCd,kind,providerId,raw,updatedAt) SELECT finPrdtCd,kind,providerId,raw,updatedAt FROM Product");
    }],
    ["foreign key damage", (db: Database) => { db.pragma("foreign_keys=OFF"); db.exec("UPDATE Favorite SET productId=999"); }],
  ])("blocks %s before any write or backup", async (_name, corrupt) => {
    const input = fixture();
    edit(input.databasePath, corrupt);
    const before = fs.readFileSync(input.databasePath);
    expect(inspectFinlifeIdentityMigration(input).status).toBe("blocked");
    await expect(apply(input)).rejects.toThrow(/FINLIFE/);
    expect(fs.readFileSync(input.databasePath)).toEqual(before);
    expect(fs.existsSync(path.join(input.controlRoot, "backups"))).toBe(false);
  });

  it("rolls back all DDL and row changes when a real SQLite trigger aborts application", async () => {
    const input = fixture();
    edit(input.databasePath, db => db.exec("CREATE TRIGGER reject_identity BEFORE UPDATE ON Product BEGIN SELECT RAISE(ABORT,'fixture abort'); END"));
    const before = snapshotDatabase(input.databasePath);
    await expect(apply(input)).rejects.toThrow(/fixture abort/);
    expect(snapshotDatabase(input.databasePath)).toEqual(before);
    expect(inspectFinlifeIdentityMigration(input).status).toBe("required");
    const backups = fs.readdirSync(path.join(input.controlRoot, "backups", "finlife-identity"));
    expect(backups).toHaveLength(1);
    expect(snapshotDatabase(path.join(input.controlRoot, "backups", "finlife-identity", backups[0], "before.sqlite"))).toEqual(before);
    edit(input.databasePath, db => db.exec("DROP TRIGGER reject_identity"));
    expect((await apply(input)).status).toBe("ready");
  });

  it("rolls back unexpected trigger side effects on user data", async () => {
    const input = fixture();
    edit(input.databasePath, db => db.exec("CREATE TRIGGER changed_user AFTER UPDATE ON Product BEGIN UPDATE User SET name='unwanted'; END"));
    const before = snapshotDatabase(input.databasePath);
    await expect(apply(input)).rejects.toThrow(/preservation/i);
    expect(snapshotDatabase(input.databasePath)).toEqual(before);
  });

  it("does not write when backup storage fails", async () => {
    const input = fixture();
    fs.writeFileSync(path.join(input.controlRoot, "backups"), "blocked path");
    const before = fs.readFileSync(input.databasePath);
    await expect(apply(input)).rejects.toThrow();
    expect(fs.readFileSync(input.databasePath)).toEqual(before);
  });

  it("requires a maintenance writer and refuses live runtime capability", async () => {
    const input = fixture();
    await expect(migrateFinlifeIdentityDatabase({ ...input, capability: "" })).rejects.toThrow();
    const lease = await acquirePlanningWriterLease({ dataRoot: input.controlRoot, writerId: "runtime.desktop" });
    try {
      await expect(migrateFinlifeIdentityDatabase({ ...input, capability: lease.capability })).rejects.toThrow(/maintenance writer/);
      await expect(apply(input)).rejects.toThrow(/lease|writer/i);
    } finally { await lease.release(); }
    expect(inspectFinlifeIdentityMigration(input).status).toBe("required");
  });

  it("refuses an uncooperative SQLite writer without a partial migration", async () => {
    const input = fixture();
    const db = new Database(input.databasePath);
    db.exec("BEGIN IMMEDIATE; UPDATE User SET name='writer';");
    try { await expect(apply(input)).rejects.toThrow(/locked|busy/i); }
    finally { db.exec("ROLLBACK"); db.close(); }
    expect(inspectFinlifeIdentityMigration(input).status).toBe("required");
  });

  it("backs up committed WAL contents rather than just the main database file", async () => {
    const input = fixture();
    const db = new Database(input.databasePath);
    db.pragma("journal_mode=WAL");
    db.pragma("wal_autocheckpoint=0");
    db.exec("UPDATE User SET name='committed WAL user'");
    try {
      const before = snapshotDatabase(input.databasePath);
      const result = await apply(input);
    if (!result.backupPath || !result.receiptPath) throw new Error("applied migration must report verified backup and receipt");
      expect(snapshotDatabase(result.backupPath)).toEqual(before);
      const standaloneRestore = path.join(input.controlRoot, "wal-backup-restored.sqlite");
      fs.copyFileSync(result.backupPath, standaloneRestore);
      expect(snapshotDatabase(standaloneRestore)).toEqual(before);
      expect(snapshotDatabase(input.databasePath, { omitIdentity: true })).toEqual(before);
    } finally { db.close(); }
  });

  it("blocks unexpected unique indexes and mismatched existing keys instead of guessing", async () => {
    const input = fixture({ identityColumn: true });
    edit(input.databasePath, db => db.exec("UPDATE Product SET identityKey='wrong'"));
    expect(inspectFinlifeIdentityMigration(input).status).toBe("blocked");
    edit(input.databasePath, db => db.exec("UPDATE Product SET identityKey=NULL; DROP INDEX Product_finPrdtCd_key; CREATE UNIQUE INDEX custom_code ON Product(finPrdtCd)"));
    expect(inspectFinlifeIdentityMigration(input).status).toBe("blocked");
  });

  it("recognizes a truly empty DB but rejects unrelated or symlinked databases", () => {
    const input = fixture();
    const absent = path.join(input.controlRoot, "absent.sqlite");
    expect(inspectFinlifeIdentityMigration({ ...input, databasePath: absent }).status).toBe("empty");
    const db = new Database(absent); db.exec("CREATE TABLE unrelated(id INTEGER)"); db.close();
    expect(inspectFinlifeIdentityMigration({ ...input, databasePath: absent }).status).toBe("blocked");
    const link = path.join(input.controlRoot, "alias.sqlite");
    fs.symlinkSync(input.databasePath, link);
    expect(inspectFinlifeIdentityMigration({ ...input, databasePath: link }).status).toBe("blocked");
  });
});

it("preserves references through the real Prisma client and subsequent save/reopen/SQLite backup", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaBetterSqlite3 } = await import("@prisma/adapter-better-sqlite3");
  const input = fixture({ globalUnique: false, secondCompany: true });
  await apply(input);
  const connect = (databasePath: string) => new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: "file:" + databasePath }) });
  const prisma = connect(input.databasePath);
  try {
    expect(await prisma.favorite.findMany({ orderBy: { id: "asc" }, select: { id: true, product: { select: { id: true, identityKey: true } } } })).toEqual([
      { id: 70, product: { id: 40, identityKey: "finlife:deposit:0010001:SHARED-CODE" } },
      { id: 71, product: { id: 41, identityKey: "finlife:deposit:0010002:SHARED-CODE" } },
    ]);
    await prisma.userProfile.update({ where: { id: 7 }, data: { purpose: "saved after migration" } });
    expect(await prisma.externalProductMatch.findMany({ orderBy: { id: "asc" }, select: { id: true, internalProductId: true } })).toEqual([
      { id: 80, internalProductId: 40 }, { id: 81, internalProductId: 41 },
    ]);
  } finally { await prisma.$disconnect(); }
  const after = snapshotDatabase(input.databasePath);
  const copy = path.join(input.controlRoot, "post-migration-backup.sqlite");
  const db = new Database(input.databasePath);
  try { await db.backup(copy); } finally { db.close(); }
  expect(snapshotDatabase(copy)).toEqual(after);
  const reopened = connect(copy);
  try {
    expect(await reopened.userProfile.findUnique({ where: { id: 7 }, select: { purpose: true } })).toEqual({ purpose: "saved after migration" });
    expect(await reopened.plannerSnapshot.findUnique({ where: { id: 8 }, select: { monthlyIncome: true, assumptions: true } })).toEqual({ monthlyIncome: 5000000, assumptions: { fixture: "unchanged" } });
  } finally { await reopened.$disconnect(); }
});

it("does not confuse nonfinite SQLite REAL values with NULL in preservation fingerprints", async () => {
  const input = fixture();
  edit(input.databasePath, db => db.exec("UPDATE PlannerSnapshot SET goalAmount=1e999; CREATE TRIGGER changed_nonfinite AFTER UPDATE ON Product BEGIN UPDATE PlannerSnapshot SET goalAmount=NULL; END;"));
  await expect(apply(input)).rejects.toThrow(/preservation/i);
  edit(input.databasePath, db => expect(db.prepare("SELECT goalAmount FROM PlannerSnapshot WHERE id=8").get()).toEqual({ goalAmount: Infinity }));
});


it("reports commit followed by a receipt write failure honestly and permits a read-only rerun", async () => {
  const input = fixture();
  let preventedReceipt = false;
  const watcher = fs.watch(input.controlRoot, { recursive: true }, (_event, filename) => {
    if (!filename?.toString().endsWith("before.sqlite") || preventedReceipt) return;
    const directory = path.dirname(path.join(input.controlRoot, filename.toString()));
    fs.mkdirSync(path.join(directory, "applied.json"));
    preventedReceipt = true;
  });
  try {
    await expect(apply(input)).rejects.toMatchObject({ migrationCommitted: true, code: "EEXIST" });
  } finally { watcher.close(); }
  expect(preventedReceipt).toBe(true);
  expect(inspectFinlifeIdentityMigration(input).status).toBe("ready");
  const before = fs.readFileSync(input.databasePath);
  expect(await apply(input)).toMatchObject({ status: "ready", applied: false });
  expect(fs.readFileSync(input.databasePath)).toEqual(before);
});
