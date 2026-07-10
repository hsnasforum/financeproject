# 2026-07-10 Issue #209 legacy planner compatibility 경계 guard

## 변경 파일

- `scripts/planner_deprecated_guard.mjs`
- `tests/planner-deprecated-guard.test.ts`
- `docs/planner-deprecated-cleanup.md`
- `work/7/10/2026-07-10-issue-209-legacy-planner-boundary-guard.md`

## 사용 skill

- `finance-skill-routing`: planning 구조 감사에 필요한 최소 skill 조합 선택
- `planning-gate-selector`: guard/script, route SSOT, planning compatibility 영향에 맞는 검증 세트 선택
- `work-log-closeout`: 실제 변경·검증·잔여 리스크를 다음 작업자가 이어갈 수 있게 기록

## 변경 이유

- 연결 Issue: https://github.com/hsnasforum/financeproject/issues/209
- 후속 근거 Issue: https://github.com/hsnasforum/financeproject/issues/115
- current main `25ec7869`의 기존 guard는 삭제된 `core/metrics/rules` 복원만 막아, `legacyPlanModel` 신규 소비자나 parked legacy UI 재연결을 탐지하지 못했습니다.
- `/planner`·`/report` redirect와 `/api/planner/compute` compatibility 계약은 유지하면서 legacy 구현 의존 경계가 다시 넓어지는 회귀만 차단합니다.

## 핵심 변경

- TypeScript AST로 static import/export/import type/require와 정적 경계 specifier를 분석하는 테스트 가능 guard 함수로 정리했습니다.
- `legacyPlanModel` direct importer를 기존 전이 adapter 3개로 제한했습니다.
- `src/lib/planner/**` 바깥의 현재 import edge를 상한 allowlist로 고정해 App Router 중간 wrapper를 통한 간접 재연결도 차단합니다.
- `PlannerClient`, `PlannerWizard`, `ReportClient`의 parked production 연결 상태를 고정했습니다.
- 삭제 모듈 파일·하위 경로 보호를 유지하고 fixture 8건과 실제 CLI entrypoint smoke를 추가했습니다.
- public route/API, 계산 로직, storage, DB, cache 코드는 수정하지 않았습니다.

## 검증

- `node --check scripts/planner_deprecated_guard.mjs`: PASS
- `corepack pnpm planner:deprecated:guard`: PASS
- `corepack pnpm vitest run tests/planner-deprecated-guard.test.ts`: PASS, 1 file / 8 tests
- `corepack pnpm vitest run tests/planner-deprecated-guard.test.ts tests/planning/catalog/planningRoutePolicy.test.ts tests/planning/report-canonical-contract.test.ts tests/planner-wizard-ui.test.tsx`: PASS, 4 files / 17 tests
- `corepack pnpm planning:ssot:check`: PASS, 5 files / 9 tests
- `corepack pnpm lint`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS, 795 files / 2,680 tests
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm planning:v2:complete`: PASS, fast E2E 8 tests 포함
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm planning:v2:compat --keep-sandbox`: PASS, fixture 8 tests와 fast E2E 8 tests 포함, sandbox `/tmp/planning-v2-compat-ymRE69`
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm planning:v2:regress`: PASS, golden case 9건과 full E2E 10 tests 포함
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, 250 static pages 생성
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --check`: PASS
- 최초 full test와 lint 병렬 실행에서는 `planning-v2-static-guard.test.ts` 1건이 5초 timeout으로 실패했습니다. 해당 테스트 단독 재실행은 2 tests PASS였고, 이후 lint와 full test를 독립 실행해 전체 PASS를 재확인했습니다.
- 독립 reviewer 재검토: 초기 간접 wrapper, require alias, 문서 범위, CLI smoke finding 반영 후 blocker 없음

## 남은 리스크

- 계산해서 만든 동적 module specifier는 정적 guard가 자동 판별하지 못합니다. cleanup 문서에서 사용 금지로 고정했으며 실제 도입 시 별도 lint 강화가 필요합니다.
- allowlist는 기존 경계의 상한선이므로 migration으로 소비자가 사라질 때 함께 축소해야 합니다.
- Windows 네이티브 Node에서 CLI smoke는 별도로 실행하지 않았고, WSL/POSIX CLI와 path normalization fixture만 확인했습니다.
- production access log와 telemetry가 없어 `/planner`, `/report`, `/api/planner/compute`, `/api/planner/assumptions` 제거 여부는 판단하지 않았습니다.
- Public URL/API/응답 shape, DB schema/Prisma query, cache/revalidation 동작 변경 없음
- PR #210 GitHub Actions CI/E2E는 모두 job step 0건으로 실패했습니다. 각 annotation은 recent account payments 실패 또는 spending limit 상향 필요를 명시해 저장소 코드 실패와 구분됩니다.
- 다음 후보는 `actionQuery`의 중립 namespace 이동 타당성 감사와 Issue #206 populated DB baseline 확보입니다.

## 다음 라운드 우선순위

1. PR #210의 외부 Actions 차단을 로컬 gate 근거와 함께 기록하고 merge 여부를 판단합니다.
2. production access log/telemetry를 확보해 legacy route/API와 `planner_last_snapshot_v1` 실제 사용량을 분류합니다.
3. Issue #206 populated DB read-only baseline을 확보한 뒤 FINLIFE active ownership migration 범위를 다시 판단합니다.
