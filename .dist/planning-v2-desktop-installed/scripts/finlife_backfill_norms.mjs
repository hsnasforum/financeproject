import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createRequire } from "node:module";

for (const name of [".env.local", "env.local", ".env"]) {
  const filePath = path.join(process.cwd(), name);
  if (!fs.existsSync(filePath)) continue;
  dotenv.config({ path: filePath, override: false, quiet: true });
}

const require = createRequire(import.meta.url);

function normalizeSearchText(input) {
  return String(input || "")
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll("주식회사", "")
    .replaceAll("(주)", "")
    .replaceAll("㈜", "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim();
}

async function getPrismaClient() {
  const [{ PrismaClient }, adapterPkg] = await Promise.all([
    import("@prisma/client"),
    Promise.resolve(require("@prisma/adapter-better-sqlite3")),
  ]);
  const Adapter = adapterPkg.PrismaBetterSqlite3 ?? adapterPkg.PrismaBetterSQLite3;
  if (!Adapter) throw new Error("Prisma SQLite adapter not found");
  return new PrismaClient({
    adapter: new Adapter({ url: process.env.DATABASE_URL ?? "file:./prisma/dev.db" }),
    log: ["error"],
  });
}

async function main() {
  const prisma = await getPrismaClient();
  let scanned = 0;
  let updated = 0;
  const batchSize = 500;
  let cursorId = 0;

  try {
    while (true) {
      const rows = await prisma.product.findMany({
        where: {
          id: { gt: cursorId },
          OR: [
            { providerNameNorm: null },
            { productNameNorm: null },
            { searchTextNorm: null },
          ],
        },
        orderBy: { id: "asc" },
        take: batchSize,
        select: {
          id: true,
          name: true,
          providerNameNorm: true,
          productNameNorm: true,
          searchTextNorm: true,
          raw: true,
          provider: {
            select: {
              name: true,
            },
          },
        },
      });
      if (rows.length === 0) break;

      cursorId = rows[rows.length - 1].id;
      scanned += rows.length;
      const updates = [];

      for (const row of rows) {
        const raw = (row.raw && typeof row.raw === "object") ? row.raw : {};
        const providerRaw = typeof raw.kor_co_nm === "string" ? raw.kor_co_nm : (row.provider?.name ?? "");
        const productRaw = typeof raw.fin_prdt_nm === "string" ? raw.fin_prdt_nm : (row.name ?? "");
        const providerNameNorm = normalizeSearchText(providerRaw) || null;
        const productNameNorm = normalizeSearchText(productRaw) || null;
        const searchTextNorm = normalizeSearchText(`${providerRaw} ${productRaw}`) || null;

        if (
          row.providerNameNorm === providerNameNorm
          && row.productNameNorm === productNameNorm
          && row.searchTextNorm === searchTextNorm
        ) {
          continue;
        }

        updates.push(
          prisma.product.update({
            where: { id: row.id },
            data: {
              providerNameNorm,
              productNameNorm,
              searchTextNorm,
            },
          }),
        );
      }

      if (updates.length > 0) {
        for (let i = 0; i < updates.length; i += 200) {
          const chunk = updates.slice(i, i + 200);
          await prisma.$transaction(chunk);
        }
        updated += updates.length;
      }
    }

    console.log("[finlife:backfill-norms] done");
    console.log(`- scanned: ${scanned}`);
    console.log(`- updated: ${updated}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[finlife:backfill-norms] failed: ${message}`);
  process.exit(1);
});

