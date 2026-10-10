import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import Database from "better-sqlite3";

let schemaSql: string;
export function createFinlifeLegacyFixture(databasePath: string, options: {
  globalUnique?: boolean; identityColumn?: boolean; secondCompany?: boolean;
} = {}) {
  if (!schemaSql) {
    const result = spawnSync(process.execPath, [
      "node_modules/prisma/build/index.js", "migrate", "diff",
      "--from-empty", "--to-schema", "prisma/schema.prisma", "--script",
    ], { cwd: process.cwd(), encoding: "utf8" });
    if (result.status !== 0 || !result.stdout.includes('CREATE TABLE "Product"')) throw new Error("fixture schema generation failed: " + result.stderr);
    schemaSql = result.stdout;
  }
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.exec(schemaSql);
  db.exec('DROP INDEX "Product_identityKey_key"; DROP INDEX "Product_finPrdtCd_idx";');
  if (!options.identityColumn) db.exec('ALTER TABLE "Product" DROP COLUMN "identityKey";');
  if (options.globalUnique !== false) db.exec('CREATE UNIQUE INDEX "Product_finPrdtCd_key" ON "Product"("finPrdtCd");');
  db.exec(`
    INSERT INTO "User" (id, name, email, passwordHash, updatedAt) VALUES ('owner-a', 'fixture user', 'fixture@example.invalid', 'fixture-only', '2026-10-01');
    INSERT INTO "UserProfile" (id, userId, purpose, updatedAt) VALUES (7, 'owner-a', 'preserve profile', '2026-10-01');
    INSERT INTO "PlannerSnapshot" (id, userId, userProfileId, monthlyIncome, assumptions) VALUES (8, 'owner-a', 7, 5000000, '{"fixture":"unchanged"}');
    INSERT INTO "Provider" (id, code, name) VALUES (10, '0010001', 'Fixture Bank A'), (11, '0010002', 'Fixture Bank B');
    INSERT INTO "ExternalProduct" (id, sourceId, kind, externalKey, providerNameRaw, providerNameNorm, productNameRaw, productNameNorm, rawJson, updatedAt)
      VALUES (9, 'fixture', 'deposit', 'external-fixture', 'Fixture Bank', 'fixturebank', 'External fixture', 'externalfixture', '{}', '2026-10-01');
  `);
  const count = options.secondCompany ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const raw = { fin_co_no: "001000" + (i + 1), fin_prdt_cd: "SHARED-CODE", dcls_month: "202609", fin_prdt_nm: "fixture deposit" };
    db.prepare('INSERT INTO "Product" (id, finPrdtCd, kind, name, providerId, raw, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(40 + i, raw.fin_prdt_cd, "deposit", raw.fin_prdt_nm, 10 + i, JSON.stringify(raw), "2026-10-01");
    db.prepare('INSERT INTO "ProductOption" (id, productId, saveTrm, intrRate, raw) VALUES (?, ?, ?, ?, ?)')
      .run(60 + i, 40 + i, "12", 3.25, JSON.stringify({ ...raw, intr_rate_type: "S", save_trm: "12", intr_rate: 3.25 }));
    db.prepare('INSERT INTO "Favorite" (id, userId, userProfileId, productId) VALUES (?, ?, ?, ?)').run(70 + i, "owner-a", 7, 40 + i);
    db.prepare('INSERT INTO "ExternalProductMatch" (id, externalProductId, internalProductId, method, confidence, evidenceJson) VALUES (?, ?, ?, ?, ?, ?)')
      .run(80 + i, 9, 40 + i, "manual", 1, '{"fixture":"keep"}');
  }
  db.close();
}

export function snapshotDatabase(databasePath: string, { omitIdentity = false } = {}) {
  const db = new Database(databasePath, { readonly: true });
  try {
    const result: Record<string, unknown[]> = {};
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all() as { name: string }[];
    for (const { name } of tables) {
      const quote = (v: string) => '"' + v.replaceAll('"', '""') + '"';
      const columns = (db.pragma(`table_info(${quote(name)})`) as { name: string }[])
        .map(c => c.name).filter(c => !omitIdentity || name !== "Product" || c !== "identityKey");
      result[name] = db.prepare(`SELECT ${columns.map(quote).join(",")} FROM ${quote(name)}`).all()
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
    return result;
  } finally { db.close(); }
}
