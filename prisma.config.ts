import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { defineConfig, env } from "prisma/config";

for (const name of [".env.local", "env.local", ".env"]) {
  const filePath = path.join(process.cwd(), name);
  if (!fs.existsSync(filePath)) continue;
  dotenv.config({ path: filePath, override: false, quiet: true });
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
