# 2026-07-01 P1/P2 통합 PR 준비

## 변경 파일
- P1/P2 통합 커밋 15개: storage error semantics, file-store concurrency, v3 transaction write owner, action center SSOT, draft boundary, deposit protection, public API provenance, desktop artifact provenance, run creation service, runStore read purity, v3 canonical root, unified source loaders, report interpretation, quality gates, rounding policy.
- 후속 정리 파일: `docs/README.md`, `docs/planner-deprecated-cleanup.md`, `docs/planning-v2-ops.md`, `docs/planning-v3-boundary-adr.md`, `scripts/planner_deprecated_guard.mjs`, `scripts/planning_v2_ops_safety.mjs`.
- workspace hook 분리: `src/components/planning/workspace/useWorkspaceRuntimeBundle.ts`, `useWorkspaceFeedbackSubmitAction.ts`, `useWorkspaceOptimizeAction.ts`, `useWorkspaceProfileSyncAction.ts`, `useWorkspaceRunExecutionActions.ts`, `useWorkspaceRuntimeStateBundle.ts`, `workspaceRuntimeHelpers.ts`.
- 검증/계약 테스트: `tests/desktop-artifact-provenance.test.ts`, `tests/planning-v3-store-concurrency.test.ts`, `tests/planning/auth/postgresReadinessScript.test.ts`, `tests/planning/auth/vitestPlanningAuthFallbackContract.test.ts`, `tests/planning/ops-safety.test.ts`.
- 전달/감사 기록: `work/6/28/*`, `work/6/29/*`, `work/6/30/*`, `work/7/1/2026-07-01-p1-p2-integration-pr.md`.

## 사용 skill
- `github:yeet`: 로컬 commit, push, PR 생성, CI 확인, merge 흐름을 진행하기 위해 사용했습니다.
- `planning-gate-selector`: planning v2/v3, API, ops script, release gate 영향에 맞는 검증 범위를 고르기 위해 사용했습니다.
- `work-log-closeout`: 실제 변경 파일, 실행 명령, 실패/성공 증거, 남은 리스크를 `/work` 기록으로 남기기 위해 사용했습니다.

## 변경 이유
- P0 3개 PR merge 이후 남은 P1/P2 구현과 후속 dirty follow-up을 최신 `main` 위에서 하나의 통합 PR로 재구성해야 했습니다.
- 원격/운영/외부 DB 검증은 현재 범위 밖이므로 blocked가 아니라 deferred external verification으로 유지하고, 로컬 synthetic fixture와 dry-run 검증으로 대체했습니다.
- `tests/planning-v2-static-guard.test.ts`가 더 이상 fallback 없는 정적 route source reference로 잡히지 않아 auth fallback allowlist를 최신 코드 기준으로 정리했습니다.

## 핵심 변경
- P1 저장 오류 의미, 동시성, 원본 단일화, 기능 계약, provenance, desktop artifact, run application service 변경을 최신 `main` 기준으로 통합했습니다.
- P2 구조 개선은 P1/P0 merge 이후 커밋 순서대로 얹었고, runStore read purity, canonical root, loader split, report contract, quality gate registry, rounding policy를 포함했습니다.
- 후속 workspace runtime hook 분리와 ops safety inventory 문서/테스트를 통합했습니다.
- desktop artifact provenance 변경으로 기존 tracked `.dist/planning-v2-desktop*` 산출물은 stale artifact로 보지 않도록 제거되었습니다.

## 검증
- 수정 전 실패 증거: `DATABASE_URL=file:./prisma/ci.db corepack pnpm test`가 `tests/planning/auth/vitestPlanningAuthFallbackContract.test.ts`에서 allowlist 불일치로 실패했습니다.
- 수정 후 targeted: `DATABASE_URL=file:./prisma/ci.db corepack pnpm test tests/planning/auth/vitestPlanningAuthFallbackContract.test.ts` PASS, 1 file, 3 tests.
- 수정 후 전체: `DATABASE_URL=file:./prisma/ci.db corepack pnpm test` PASS, 739 files, 2443 tests.
- `corepack pnpm typecheck` PASS.
- `corepack pnpm lint` PASS.
- `corepack pnpm planning:v2:ops:safety` PASS, `legacyCandidates=0`, report `.data/planning/ops/reports/20260701-044513-safety.json`.
- `corepack pnpm build` PASS.
- `corepack pnpm release:verify` FAIL: `planning:postgres:readiness`가 `DATABASE_URL` 미설정으로 실패했습니다.
- `DATABASE_URL="postgresql://finance_user:local-only@127.0.0.1:1/finance_test?schema=public" corepack pnpm release:verify` PASS. 이 실행은 외부 DB 연결 검사가 아니라 PostgreSQL schema dry-run을 위한 local-only URL 주입입니다.
- `git diff --check` PASS.
- `git diff --cached --check` PASS.
- `corepack pnpm multi-agent:guard` 1차 FAIL: 최신 `/work` 기록에 `다음 라운드 우선순위` 섹션이 없어 실패했습니다.
- `corepack pnpm multi-agent:guard` 2차 PASS: `latestWorkNote=work/7/1/2026-07-01-p1-p2-integration-pr.md`.

## 남은 리스크
- 실제 운영 topology, 운영 환경변수, 외부 PostgreSQL 연결, 원격 CI 결과는 PR 생성 뒤 확인해야 하며 현재 로컬 결과에서는 deferred external verification입니다.
- PostgreSQL readiness dry-run의 migration 대상은 로컬 synthetic inventory 기준 `targetedFiles=0`, `skippedRecords=0`, target table operations 0건이었습니다. rollback probe는 적용 operation이 없어 `SKIPPED(no_target_operations)`입니다.
- 소유자 불명 legacy 데이터는 자동 배정하지 않는 방향으로 유지했고, 이번 synthetic safety inventory에서는 quarantine 대상이 0건으로 관측됐습니다.
- `release:verify` 중 한 테스트에서 audit tmp rename 경고 로그가 출력됐지만 최종 테스트 결과는 PASS였습니다. 다중 프로세스 공유 파일 저장소의 분산 lock 검증은 실제 운영 topology 확인 대상입니다.
- 다음 단계는 통합 commit/push/PR 생성 후 원격 `CI`와 `E2E Smoke`를 확인하고, 통과하면 squash merge하는 것입니다.

## 다음 라운드 우선순위
- `corepack pnpm multi-agent:guard`를 최신 `/work` 기록 기준으로 재실행합니다.
- 통합 변경을 commit하고 `codex/p1-p2-integration` 브랜치를 push합니다.
- PR 생성 후 원격 `CI`와 `E2E Smoke`를 확인하고, 통과하면 squash merge합니다.
