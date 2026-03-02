import fs from "node:fs";
import path from "node:path";

const REQUIRED = ["@prisma/engines", "better-sqlite3", "esbuild", "prisma"];

function main() {
  const filePath = path.join(process.cwd(), "package.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const pnpm = parsed.pnpm && typeof parsed.pnpm === "object" ? parsed.pnpm : {};
    const current = Array.isArray(pnpm.onlyBuiltDependencies) ? pnpm.onlyBuiltDependencies : [];
    const merged = [...new Set([...current, ...REQUIRED])].sort((a, b) => a.localeCompare(b));

    parsed.pnpm = {
      ...pnpm,
      onlyBuiltDependencies: merged,
    };

    fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
    console.log(`[deps:approve-builds] updated onlyBuiltDependencies (${merged.length})`);
  } catch {
    console.error("[deps:approve-builds] failed to read/write package.json");
    process.exit(1);
  }
}

main();
