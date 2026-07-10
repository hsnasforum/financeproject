import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function listScriptSources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listScriptSources(filePath);
    return /\.(?:mjs|js|tsx|ts)$/u.test(entry.name) ? [filePath] : [];
  });
}

function importedModuleSpecifiers(filePath: string): string[] {
  const sourceText = fs.readFileSync(filePath, "utf-8");
  if (!sourceText.includes("syncRunner")) return [];
  const source = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx")
      ? ts.ScriptKind.TSX
      : filePath.endsWith(".ts")
        ? ts.ScriptKind.TS
        : ts.ScriptKind.JS,
  );
  const specifiers: string[] = [];

  function visit(node: ts.Node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (isDynamicImport || isRequire) specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return specifiers;
}

describe("FINLIFE sync entrypoint contract", () => {
  it("keeps the DB-backed mjs scripts as the only CLI sync entrypoints", () => {
    const root = process.cwd();
    const scriptsDir = path.join(root, "scripts");
    const syncEntrypoints = fs.readdirSync(scriptsDir)
      .filter((name) => /^finlife_sync(?:_if_stale)?\.(?:mjs|ts)$/u.test(name))
      .sort();
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8")) as {
      scripts?: Record<string, string>;
    };
    const packageScripts = packageJson.scripts ?? {};
    const syncScript = fs.readFileSync(path.join(scriptsDir, "finlife_sync.mjs"), "utf-8");
    const persistenceCore = fs.readFileSync(path.join(scriptsDir, "finlife_persistence.mjs"), "utf-8");
    const forbiddenPackageEntrypoints = Object.entries(packageScripts)
      .filter(([, command]) => (
        /finlife_sync(?:_if_stale)?\.ts/u.test(command)
        || /src[\\/][^\s]*finlife[\\/]/u.test(command)
      ))
      .map(([name]) => name);
    const directRuntimeRunnerImports = [
      ...listScriptSources(scriptsDir),
      ...listScriptSources(path.join(root, "src")),
    ]
      .filter((filePath) => importedModuleSpecifiers(filePath).some((specifier) => (
        /(?:^|\/)src\/lib\/finlife\/syncRunner(?:\.ts)?$/u.test(specifier.replaceAll("\\", "/"))
        || /(?:^|\/)finlife\/syncRunner(?:\.ts)?$/u.test(specifier.replaceAll("\\", "/"))
      )))
      .map((filePath) => path.relative(root, filePath).replaceAll("\\", "/"))
      .sort();

    expect(syncEntrypoints).toEqual([
      "finlife_sync.mjs",
      "finlife_sync_if_stale.mjs",
    ]);
    expect(packageJson.scripts?.["finlife:sync"]).toBe("node scripts/finlife_sync.mjs");
    expect(packageJson.scripts?.["finlife:sync:if-stale"]).toBe("node scripts/finlife_sync_if_stale.mjs");
    expect(packageJson.scripts?.["products:sync"]).toBe("node scripts/finlife_sync.mjs && node scripts/datago_sync.mjs");
    expect(forbiddenPackageEntrypoints).toEqual([]);
    expect(directRuntimeRunnerImports).toEqual([
      "src/lib/finlife/persistentSync.ts",
    ]);
    expect(syncScript).toContain('from "./finlife_persistence.mjs"');
    expect(syncScript).not.toContain("prisma.product.upsert");
    expect(syncScript).not.toContain("prisma.externalSourceSnapshot.upsert");
    expect(persistenceCore).not.toContain("process.exit");
    expect(persistenceCore).not.toContain("runSyncKinds");
  });

  it("documents package scripts as the supported operator boundary", () => {
    const docs = fs.readFileSync(path.join(process.cwd(), "docs", "finlife-sync.md"), "utf-8");

    expect(docs).toContain("운영 FINLIFE sync의 단일 진입점");
    expect(docs).toContain("pnpm finlife:sync");
    expect(docs).toContain("pnpm finlife:sync:if-stale");
    expect(docs).toContain("별도 TypeScript sync script를 직접 실행하는 경로는 지원하지 않습니다.");
  });
});
