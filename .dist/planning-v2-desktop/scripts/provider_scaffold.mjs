#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const out = {};
  for (const entry of argv) {
    if (!entry.startsWith("--")) continue;
    const idx = entry.indexOf("=");
    if (idx < 0) {
      out[entry.slice(2)] = "1";
      continue;
    }
    out[entry.slice(2, idx)] = entry.slice(idx + 1);
  }
  return out;
}

function toPascalCase(input) {
  return input
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeIfMissing(filePath, content) {
  if (fs.existsSync(filePath)) return false;
  fs.writeFileSync(filePath, content, "utf8");
  return true;
}

function updateRegistry(rootDir, id, providerVarName) {
  const registryPath = path.join(rootDir, "src/lib/providers/registry.ts");
  if (!fs.existsSync(registryPath)) return false;

  const raw = fs.readFileSync(registryPath, "utf8");
  const importLine = `import { ${providerVarName} } from "./${id}";`;
  const entryLine = `  ${id}: ${providerVarName},`;

  let next = raw;
  if (!next.includes(importLine)) {
    next = next.replace("// provider-scaffold:imports", `${importLine}\n// provider-scaffold:imports`);
  }
  if (!next.includes(entryLine)) {
    next = next.replace("// provider-scaffold:entries", `${entryLine}\n  // provider-scaffold:entries`);
  }

  if (next !== raw) {
    fs.writeFileSync(registryPath, next, "utf8");
    return true;
  }
  return false;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const id = (args.id ?? "").trim();
  const displayName = (args.displayName ?? "").trim();

  if (!/^[a-z][a-z0-9_]*$/.test(id)) {
    console.error('[provider:scaffold] --id must match ^[a-z][a-z0-9_]*$');
    process.exit(1);
  }
  if (!displayName) {
    console.error("[provider:scaffold] --displayName is required");
    process.exit(1);
  }

  const rootDir = process.cwd();
  const providerDir = path.join(rootDir, "src/lib/providers", id);
  const testsDir = path.join(rootDir, "tests/providers");
  const docsDir = path.join(rootDir, "docs/providers");
  ensureDir(providerDir);
  ensureDir(testsDir);
  ensureDir(docsDir);

  const pascal = toPascalCase(id);
  const providerVarName = `${id}Provider`;
  const requestTypeName = `${pascal}ProviderRequest`;
  const dataTypeName = `${pascal}ProviderData`;

  const created = [];

  const typesPath = path.join(providerDir, "types.ts");
  if (writeIfMissing(typesPath, `export type ${requestTypeName} = Record<string, unknown>;\n\nexport type ${dataTypeName} = Record<string, unknown>;\n`)) {
    created.push(path.relative(rootDir, typesPath));
  }

  const indexPath = path.join(providerDir, "index.ts");
  if (writeIfMissing(indexPath, `import { type Provider } from "../types";\nimport { type ${dataTypeName}, type ${requestTypeName} } from "./types";\n\nexport const ${providerVarName}: Provider<${requestTypeName}, ${dataTypeName}> = {\n  id: "${id}",\n  displayName: "${displayName}",\n  isConfigured(env) {\n    return Boolean((env.${id.toUpperCase()}_API_KEY ?? "").trim());\n  },\n  buildCacheKey(req) {\n    return JSON.stringify(req ?? {});\n  },\n  async fetch(_req) {\n    return {\n      ok: false,\n      error: {\n        code: "INTERNAL",\n        message: "${displayName} provider not implemented yet",\n      },\n      meta: {\n        sourceId: "${id}",\n        generatedAt: new Date().toISOString(),\n      },\n    };\n  },\n};\n`)) {
    created.push(path.relative(rootDir, indexPath));
  }

  const testPath = path.join(testsDir, `${id}.contract.test.ts`);
  if (writeIfMissing(testPath, `import { describe, expect, it } from "vitest";\nimport { ${providerVarName} } from "../../src/lib/providers/${id}";\nimport { runProvider } from "../../src/lib/providers/runProvider";\nimport { expectProviderContract } from "./contractHarness";\n\ndescribe("${id} provider contract", () => {\n  it("returns contract-compliant response", async () => {\n    const response = await runProvider(${providerVarName}, {}, { env: { NODE_ENV: "test" } as NodeJS.ProcessEnv });\n    expectProviderContract(response, { sourceId: "${id}" });\n    expect(response.ok).toBe(false);\n  });\n});\n`)) {
    created.push(path.relative(rootDir, testPath));
  }

  const docPath = path.join(docsDir, `${id}.md`);
  if (writeIfMissing(docPath, `# Provider: ${displayName}\n\n- id: \`${id}\`\n- status: scaffolded\n\n## Contract\n\n- Response must follow \`ProviderResponse\` in \`src/lib/providers/types.ts\`.\n- Use \`runProvider()\` to apply singleflight/cooldown/fallback/timing consistently.\n`)) {
    created.push(path.relative(rootDir, docPath));
  }

  const registryUpdated = updateRegistry(rootDir, id, providerVarName);

  console.log(`[provider:scaffold] id=${id}`);
  if (created.length > 0) {
    console.log("[provider:scaffold] created:");
    for (const file of created) {
      console.log(`- ${file}`);
    }
  } else {
    console.log("[provider:scaffold] no new files created (already exists)");
  }
  console.log(`[provider:scaffold] registry ${registryUpdated ? "updated" : "unchanged"}`);
}

main();
