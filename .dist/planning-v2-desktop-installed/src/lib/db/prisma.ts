import { PrismaClient } from "@prisma/client";
import { createRequire } from "node:module";

const globalForPrisma = globalThis as typeof globalThis & {
  __prisma?: PrismaClient;
};
type PrismaAdapter = NonNullable<ConstructorParameters<typeof PrismaClient>[0]>["adapter"];

export const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    adapter: createSqliteAdapter(),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma = prisma;
}

function createSqliteAdapter(): PrismaAdapter {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("@prisma/adapter-better-sqlite3") as {
      PrismaBetterSqlite3?: new (opts: { url: string }) => unknown;
      PrismaBetterSQLite3?: new (opts: { url: string }) => unknown;
    };
    const Adapter = pkg.PrismaBetterSqlite3 ?? pkg.PrismaBetterSQLite3;
    if (!Adapter) throw new Error("PrismaBetterSQLite3 export not found");
    return new Adapter({ url: process.env.DATABASE_URL ?? "file:./dev.db" }) as PrismaAdapter;
  } catch {
    throw new Error(
      'Prisma SQLite adapter is missing. Install "@prisma/adapter-better-sqlite3" and "better-sqlite3". ' +
      'Offline flow: "pnpm deps:offline:fetch" (online) -> "pnpm deps:offline:install" (offline).',
    );
  }
}
