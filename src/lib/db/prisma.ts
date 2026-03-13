import { PrismaClient } from "@prisma/client";
import { createRequire } from "node:module";

const globalForPrisma = globalThis as typeof globalThis & {
  __prisma?: PrismaClient;
  __prismaUrl?: string;
};
type PrismaAdapter = NonNullable<ConstructorParameters<typeof PrismaClient>[0]>["adapter"];

const databaseUrl = resolveDatabaseUrl();
const shouldReuseClient = globalForPrisma.__prisma && globalForPrisma.__prismaUrl === databaseUrl;

if (!shouldReuseClient && globalForPrisma.__prisma) {
  void globalForPrisma.__prisma.$disconnect().catch(() => undefined);
}

export const prisma =
  (shouldReuseClient ? globalForPrisma.__prisma : undefined) ??
  new PrismaClient({
    adapter: createSqliteAdapter(databaseUrl),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma = prisma;
  globalForPrisma.__prismaUrl = databaseUrl;
}

function resolveDatabaseUrl(): string {
  const normalized = (process.env.DATABASE_URL ?? "file:./prisma/dev.db").trim();
  return normalized || "file:./prisma/dev.db";
}

function createSqliteAdapter(url: string): PrismaAdapter {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("@prisma/adapter-better-sqlite3") as {
      PrismaBetterSqlite3?: new (opts: { url: string }) => unknown;
      PrismaBetterSQLite3?: new (opts: { url: string }) => unknown;
    };
    const Adapter = pkg.PrismaBetterSqlite3 ?? pkg.PrismaBetterSQLite3;
    if (!Adapter) throw new Error("PrismaBetterSQLite3 export not found");
    return new Adapter({ url }) as PrismaAdapter;
  } catch {
    throw new Error(
      'Prisma SQLite adapter is missing. Install "@prisma/adapter-better-sqlite3" and "better-sqlite3". ' +
      'Offline flow: "pnpm deps:offline:fetch" (online) -> "pnpm deps:offline:install" (offline).',
    );
  }
}
