export type FinalReportGateStatus = "PASS" | "FAIL" | "SKIPPED";

export type FinalReportGateResult = {
  id: "complete" | "regress" | "acceptance";
  command: string;
  status: FinalReportGateStatus;
  logPath: string;
  note?: string;
};

export type FinalReportTemplateInput = {
  version: string;
  createdAt: string;
  doneHighlights: string[];
  userScope: string[];
  opsScope: string[];
  gates: FinalReportGateResult[];
  docsIncluded: string[];
  releaseNotesPath?: string;
  knownLimitations: string[];
  nextCandidates?: string[];
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function renderBullets(values: string[], fallback: string): string {
  const rows = values.map((item) => asString(item)).filter((item) => item.length > 0);
  if (rows.length === 0) return `- ${fallback}`;
  return rows.map((item) => `- ${item}`).join("\n");
}

function renderGateRows(gates: FinalReportGateResult[]): string {
  if (gates.length === 0) return "| - | - | - | - | - |\n";
  return gates.map((gate) => {
    const note = asString(gate.note) || "-";
    return `| ${gate.id} | ${gate.status} | \`${gate.command}\` | \`${gate.logPath}\` | ${note} |`;
  }).join("\n");
}

export function buildFinalReportMarkdown(input: FinalReportTemplateInput): string {
  return [
    `# Planning v2 Final Report (${input.version})`,
    "",
    `- Version: \`${input.version}\``,
    `- GeneratedAt: \`${input.createdAt}\``,
    "",
    "## 1) Done Definition 요약",
    renderBullets(input.doneHighlights, "요약 정보가 없습니다."),
    "",
    "## 2) 기능 범위",
    "### 사용자",
    renderBullets(input.userScope, "사용자 범위 요약이 없습니다."),
    "### OPS",
    renderBullets(input.opsScope, "OPS 범위 요약이 없습니다."),
    "",
    "## 3) 검증 결과",
    "| Gate | Status | Command | Log | Note |",
    "|---|---|---|---|---|",
    renderGateRows(input.gates),
    "",
    "## 4) 문서/증빙",
    renderBullets(input.docsIncluded, "문서 목록이 없습니다."),
    ...(asString(input.releaseNotesPath) ? ["- 릴리즈 노트: `" + asString(input.releaseNotesPath) + "`"] : []),
    "",
    "## 5) 운영 루틴",
    "- 일상 운영: `pnpm planning:v2:ops:run`",
    "- 주간/변경 후 회귀: `pnpm planning:v2:ops:run:regress`",
    "- 스케줄러 템플릿: `docs/planning-v2-scheduler.md`",
    "",
    "## 6) 백업/복구 요약",
    "- 백업/복구 후 `pnpm planning:v2:doctor`로 무결성을 확인합니다.",
    "- snapshot 문제 시 `/ops/assumptions`에서 history 확인 후 latest 포인터를 복구합니다.",
    "- 운영 데이터 정리는 `/ops/planning-cleanup` 또는 retention 정책으로 수행합니다.",
    "",
    "## 7) Known Limitations",
    renderBullets(input.knownLimitations, "제한사항 정보가 없습니다."),
    "",
    "## 8) 다음 확장 후보",
    renderBullets(input.nextCandidates ?? [], "후속 후보 없음"),
    "",
  ].join("\n");
}

