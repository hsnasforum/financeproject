import fs from "node:fs/promises";
import path from "node:path";

const SELF_TEST_DOC_PATH = "docs/planning-v2-5min-selftest.md";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseArgs(argv) {
  let version = "";
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const [rawKey, ...rest] = token.slice(2).split("=");
    const key = asString(rawKey);
    const value = asString(rest.join("="));
    if (key === "version") version = value;
  }
  return { version };
}

function defaultVersionFromDate(now = new Date()) {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

async function readFile(root, relativePath) {
  const filePath = path.resolve(root, relativePath);
  return fs.readFile(filePath, "utf-8");
}

function sectionBullets(md, heading) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let inSection = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^##\s+/.test(line)) {
      inSection = line === `## ${heading}`;
      continue;
    }
    if (!inSection) continue;
    if (line.startsWith("- ")) out.push(line.slice(2).trim());
  }
  return out;
}

function takeNonEmpty(lines, maxCount) {
  return lines.filter((line) => asString(line)).slice(0, maxCount);
}

function nowIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function renderSection(title, bullets) {
  const body = bullets.length > 0
    ? bullets.map((item) => `- ${item}`).join("\n")
    : "- (요약 항목 없음)";
  return `## ${title}\n${body}`;
}

async function writeReleaseNotes(root, version, content) {
  const outDir = path.resolve(root, "docs/releases");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.resolve(outDir, `planning-v2-${version}.md`);
  await fs.writeFile(outPath, `${content.trimEnd()}\n`, "utf-8");
  return outPath;
}

async function main() {
  const cwd = path.resolve(process.cwd());
  const args = parseArgs(process.argv.slice(2));
  const version = asString(args.version) || defaultVersionFromDate();

  const onepage = await readFile(cwd, "docs/planning-v2-onepage.md");
  const changelog = await readFile(cwd, "docs/planning-v2-changelog.md");
  const doneDefinition = await readFile(cwd, "docs/planning-v2-done-definition.md");
  const checklist = await readFile(cwd, "docs/planning-v2-release-checklist.md");

  const doneBullets = [
    ...takeNonEmpty(sectionBullets(doneDefinition, "기능 Done (사용자)"), 3),
    ...takeNonEmpty(sectionBullets(doneDefinition, "운영 Done (OPS)"), 2),
    ...takeNonEmpty(sectionBullets(doneDefinition, "품질 Done (게이트)"), 2),
  ].slice(0, 7);

  const userBullets = takeNonEmpty(sectionBullets(onepage, "사용자 흐름 (5줄)"), 5);
  const opsBullets = takeNonEmpty(sectionBullets(onepage, "운영 흐름 (5줄)"), 5);
  const commandBullets = takeNonEmpty(
    checklist
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- [ ] `"))
      .map((line) => line.replace(/^- \[ \]\s*/, "")),
    6,
  );
  const recentChanges = takeNonEmpty(
    changelog
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^\d+\.\s/.test(line))
      .slice(-5)
      .map((line) => line.replace(/^\d+\.\s*/, "")),
    5,
  );

  const knownLimitations = [
    "확률/시나리오 결과는 가정 기반이며 보장값이 아닙니다.",
    "Monte Carlo/상품 후보는 서버 플래그 또는 예산 정책으로 비활성화될 수 있습니다.",
    "snapshot 동기화 실패 시 마지막 스냅샷을 유지하며 경고를 확인해야 합니다.",
    "acceptance 스모크는 로컬 서버 실행(PLANNING_BASE_URL)이 필요합니다.",
    "개인 로컬 전제이며 planning/ops API는 local-only 정책을 따릅니다.",
  ];

  const content = [
    `# Planning v2 Release Notes (${version})`,
    "",
    `- Version: \`${version}\``,
    `- Date: \`${nowIsoDate()}\``,
    "",
    renderSection("Done Definition 요약", doneBullets),
    "",
    renderSection("사용자 기능 요약", userBullets),
    "",
    renderSection("OPS/운영 기능 요약", opsBullets),
    "",
    renderSection("최근 변경 요약", recentChanges),
    "",
    renderSection("실행 커맨드", commandBullets),
    "",
    renderSection("완성 확인 (3단계)", [
      "pnpm planning:v2:complete",
      "서버 실행 후 pnpm planning:v2:acceptance",
      `5분 셀프 테스트 체크 완료: ${SELF_TEST_DOC_PATH}`,
    ]),
    "",
    renderSection("Known Limitations", knownLimitations),
  ].join("\n");

  const outPath = await writeReleaseNotes(cwd, version, content);
  console.log(`[planning:v2:release:notes] generated=${path.relative(cwd, outPath).replaceAll("\\", "/")}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[planning:v2:release:notes] FAIL\n${message}`);
  process.exit(1);
});
