import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const COMPONENTS_DIR = path.join(SRC_DIR, "components");
const APP_DIR = path.join(SRC_DIR, "app");
const PLANNING_API_DIR = path.join(APP_DIR, "api", "planning", "v2");
const PLANNING_CORE_DIR = path.join(SRC_DIR, "lib", "planning", "core");

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

function isCodeFile(filePath) {
  return CODE_EXTENSIONS.has(path.extname(filePath));
}

async function walkFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
  const out = [];
  for (const entry of entries) {
    const absolute = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walkFiles(absolute));
    } else if (entry.isFile() && isCodeFile(absolute)) {
      out.push(absolute);
    }
  }
  return out;
}

function rel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function maskSnippet(input) {
  return input
    .replace(/(process\.env\.)[A-Z0-9_]+/g, "$1***")
    .replace(/(ECOS_API_KEY|GITHUB_TOKEN(?:_DISPATCH)?|FINLIFE_[A-Z0-9_]*(?:KEY|TOKEN)|Authorization\s*:\s*Bearer)\S*/gi, "$1***")
    .replace(/\.data\/[^\s"'`)]*/g, ".data/***");
}

function lineNumberFromIndex(content, index) {
  if (index < 0) return 1;
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function isUseClientFile(content) {
  return /^\s*["']use client["'];?/m.test(content);
}

async function collectClientFiles() {
  const componentFiles = await walkFiles(COMPONENTS_DIR);
  const appFiles = await walkFiles(APP_DIR);
  const useClientAppFiles = [];
  for (const filePath of appFiles) {
    const content = await fs.readFile(filePath, "utf8");
    if (isUseClientFile(content)) useClientAppFiles.push(filePath);
  }
  return Array.from(new Set([...componentFiles, ...useClientAppFiles]));
}

async function collectPlanningApiFiles() {
  const files = await walkFiles(PLANNING_API_DIR);
  return files.filter((filePath) => path.basename(filePath) === "route.ts");
}

async function collectPlanningCoreFiles() {
  return walkFiles(PLANNING_CORE_DIR);
}

function checkClientFile(filePath, content) {
  const issues = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    const envMatches = [...line.matchAll(/process\.env\.([A-Z0-9_]+)/g)];
    for (const match of envMatches) {
      const key = match[1];
      const allowed = key === "NODE_ENV" || key.startsWith("NEXT_PUBLIC_");
      if (!allowed) {
        issues.push({
          filePath,
          line: index + 1,
          code: "CLIENT_ENV",
          message: "client 코드에서 민감 env 참조 감지",
          snippet: maskSnippet(line.trim()),
        });
      }
    }

    if (/\b(ECOS_API_KEY|GITHUB_TOKEN(?:_DISPATCH)?|FINLIFE_[A-Z0-9_]*(?:KEY|TOKEN)|Authorization\s*:\s*Bearer)\b/i.test(line)) {
      issues.push({
        filePath,
        line: index + 1,
        code: "CLIENT_SECRET_PATTERN",
        message: "client 코드에서 민감 키/토큰 패턴 감지",
        snippet: maskSnippet(line.trim()),
      });
    }

    if (line.includes(".data/")) {
      issues.push({
        filePath,
        line: index + 1,
        code: "CLIENT_INTERNAL_PATH",
        message: "client 코드에서 내부 .data 경로 문자열 감지",
        snippet: maskSnippet(line.trim()),
      });
    }

    if (
      line.includes("@/lib/planning/server/")
      || line.includes("/lib/planning/server/")
      || line.includes("../planning/server/")
    ) {
      issues.push({
        filePath,
        line: index + 1,
        code: "CLIENT_SERVER_IMPORT",
        message: "client 코드에서 planning/server import 감지",
        snippet: maskSnippet(line.trim()),
      });
    }
  });

  return issues;
}

function checkPlanningApiFile(filePath, content) {
  const issues = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (line.includes(".data/")) {
      issues.push({
        filePath,
        line: index + 1,
        code: "API_INTERNAL_PATH",
        message: "planning API 코드에 내부 .data 경로 문자열 감지",
        snippet: maskSnippet(line.trim()),
      });
    }

    if (/\b(ECOS_API_KEY|GITHUB_TOKEN(?:_DISPATCH)?|FINLIFE_[A-Z0-9_]*(?:KEY|TOKEN)|Authorization\s*:\s*Bearer)\b/i.test(line)) {
      issues.push({
        filePath,
        line: index + 1,
        code: "API_SECRET_PATTERN",
        message: "planning API 코드에 민감 키/토큰 패턴 감지",
        snippet: maskSnippet(line.trim()),
      });
    }
  });

  const sourceUrlPattern = /sources\s*:\s*\[[\s\S]{0,500}?url\s*:/m;
  const match = sourceUrlPattern.exec(content);
  if (match) {
    issues.push({
      filePath,
      line: lineNumberFromIndex(content, match.index),
      code: "API_SOURCES_URL",
      message: "planning API 응답 구성에 sources.url 노출 패턴 감지",
      snippet: "sources: [ ... url: ... ]",
    });
  }

  return issues;
}

function checkPlanningCoreFile(filePath, content) {
  const issues = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (
      line.includes("/planning/server/")
      || line.includes("../server/")
      || line.includes("./server/")
    ) {
      issues.push({
        filePath,
        line: index + 1,
        code: "CORE_SERVER_IMPORT",
        message: "planning/core 코드에서 planning/server import 감지",
        snippet: maskSnippet(line.trim()),
      });
    }
  });
  return issues;
}

async function run() {
  const clientFiles = await collectClientFiles();
  const planningApiFiles = await collectPlanningApiFiles();
  const planningCoreFiles = await collectPlanningCoreFiles();

  const issues = [];

  for (const filePath of clientFiles) {
    const content = await fs.readFile(filePath, "utf8");
    issues.push(...checkClientFile(filePath, content));
  }

  for (const filePath of planningApiFiles) {
    const content = await fs.readFile(filePath, "utf8");
    issues.push(...checkPlanningApiFile(filePath, content));
  }

  for (const filePath of planningCoreFiles) {
    const content = await fs.readFile(filePath, "utf8");
    issues.push(...checkPlanningCoreFile(filePath, content));
  }

  if (issues.length > 0) {
    console.error(`[planning:v2:guard] FAIL (${issues.length} issues)`);
    for (const issue of issues) {
      console.error(` - ${issue.code} ${rel(issue.filePath)}:${issue.line} ${issue.message}`);
      if (issue.snippet) {
        console.error(`   ${issue.snippet}`);
      }
    }
    process.exit(1);
  }

  console.log(
    `[planning:v2:guard] PASS clientFiles=${clientFiles.length} planningApiFiles=${planningApiFiles.length} planningCoreFiles=${planningCoreFiles.length}`,
  );
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[planning:v2:guard] FAIL ${message}`);
  process.exit(1);
});
