# 2026-06-28 P1-04 Action Center SSOT 종료 기록

## 범위
- 기준 SHA: `6be7c0de`
- 대상: Planning v2 runs Action Center의 원본을 `action-plan.json` / `action-progress.json` canonical 파일로 단일화하고, detail/list/client 읽기 경로의 run meta backfill과 per-run fallback fetch를 제거했습니다.
- 실제 topology/env 확인: 런타임 `PLANNING_*` env 없음, `.env*`에도 `PLANNING_*` 키 없음. 기본 로컬 file topology는 `.data/planning`, namespace/single-user mode 비활성, resolved user `default`.
- 실제 Action Center inventory: run meta 0개, embedded `actionCenter` 0개, canonical plan/progress 파일 0개, legacy backup 0개, unreadable run meta 0개, ownerless legacy run meta 0개.

## 사용 skill
- `planning-gate-selector`: P1-04가 Planning v2 core/API/client/store 변경임을 기준으로 targeted test, `planning:v2:complete`, `planning:v2:regress`, lint/typecheck/build 검증 세트를 확정.
- `work-log-closeout`: 변경 파일, 실행 검증, 남은 리스크를 `/work` 종료 기록으로 정리.

## 변경 파일
- `src/lib/planning/store/runActionStore.ts`: `getRunActionProgress`를 순수 read로 축소하고, 명시적 write 경로용 `ensureRunActionProgress`, list용 batch summary, embedded Action Center migration dry-run/apply/rollback helper를 추가.
- `src/lib/planning/store/runStore.ts`: migration rollback/cleanup을 위해 `updateRun(..., { actionCenter: null })`로 embedded field 제거를 지원.
- `src/lib/planning/server/runs/repository.ts`: canonical plan snapshot, explicit progress ensure, batch summary wrapper를 route service에 노출.
- `src/lib/planning/server/runs/routeService.ts`: create/PATCH에서만 Action Center 파일을 보장하고, detail/list/action-plan/action-progress GET은 canonical 파일 우선 + embedded 호환 fallback만 수행하도록 변경.
- `src/lib/planning/server/pages/planningRscLoaders.ts`: SSR runs 초기 데이터가 동일한 batch summary helper를 사용하도록 변경.
- `src/components/PlanningRunsClient.tsx`: 목록 meta에 summary가 없을 때 `/api/planning/runs/{id}/action-progress`를 run 수만큼 재요청하던 fallback 제거.
- `tests/planning-v2-api/run-action-center-ssot.test.ts`: stale embedded 우선순위, detail read mtime, client/list fallback 제거, migration dry-run/apply/rollback 회귀 테스트 추가.
- `tests/planning-v2-api/run-detail-route-fallback.test.ts`, `tests/planning-v2-api/run-action-progress-route.test.ts`, `tests/planning-reports-page-fallback.test.tsx`: 새 SSOT/read-purity 계약과 batch summary mock에 맞게 갱신.

## 변경 이유
- 기존 detail GET은 canonical progress 파일보다 stale `run.actionCenter`를 먼저 사용했고, 파일 누락 시 읽기 경로에서 생성/backfill을 수행했습니다.
- 기존 PATCH는 progress 파일 write 뒤 run meta write를 추가로 수행해 두 번째 write 실패 시 stale embedded 상태가 canonical 파일을 가릴 수 있었습니다.
- 기존 list/client는 run별 action-progress 조회를 반복해 200-run 목록에서 순차 fs 또는 run-count HTTP fallback 위험이 있었습니다.
- 문서 기준상 plan/progress 파일이 canonical source이고, legacy embedded 상태는 자동 배정이 아니라 migration 대상으로 다뤄야 합니다.

## 전달 변경
- detail/action-plan/action-progress GET은 파일을 생성하거나 run meta를 수정하지 않습니다.
- create/PATCH 같은 명시적 write 경로에서만 plan/progress 파일을 보장하고, PATCH는 run meta에 embedded Action Center를 다시 저장하지 않습니다.
- list/RSC/client는 서버 batch summary 결과를 사용하며, client per-run action-progress fallback fetch를 제거했습니다.
- embedded legacy migration은 dry-run 기본값, apply 시 backup 후 missing canonical 파일만 생성, embedded 제거, rollback 시 backup 복원을 지원합니다.
- corrupted canonical 파일은 GET에서 자동 복구하지 않고 `NO_DATA`로 안전하게 실패하며 원본 파일을 덮어쓰지 않습니다.

## 검증
- 수정 전 실패 증거:
  - `corepack pnpm test tests/planning-v2-api/run-action-center-ssot.test.ts`
  - 실패: stale embedded가 canonical progress를 가림, detail read가 run meta mtime을 변경, list/client fallback 정적 가드 실패.
- 수정 후 targeted:
  - `corepack pnpm test tests/planning-v2-api/run-action-center-ssot.test.ts` PASS: 4 tests.
  - `corepack pnpm test tests/planning-v2-api/run-detail-route-fallback.test.ts tests/planning-v2-api/run-action-progress-route.test.ts tests/planning-v2-api/run-action-center-ssot.test.ts` PASS: 10 tests.
  - `corepack pnpm test tests/planning-reports-page-fallback.test.tsx tests/planning-store-concurrency.test.ts` PASS: 8 tests.
  - `corepack pnpm test tests/planning-v2-api/run-action-center-ssot.test.ts tests/planning-v2-api/run-detail-route-fallback.test.ts tests/planning-v2-api/run-action-progress-route.test.ts tests/planning-reports-page-fallback.test.tsx tests/planning-store-concurrency.test.ts` PASS: 19 tests.
- 필수/확장 게이트:
  - `corepack pnpm typecheck` PASS.
  - `corepack pnpm lint` PASS.
  - `corepack pnpm planning:v2:complete` PASS. 정보성 안내: v2 core 변경 tag 필요.
  - `corepack pnpm planning:v2:regress` PASS.
  - `corepack pnpm build` PASS.
  - `git diff --check` PASS.
  - `corepack pnpm test` PASS: 730 files, 2398 tests.
- inventory/topology:
  - `corepack pnpm tsx` 기반 read-only inventory 스크립트 실행. 값은 출력하지 않고 env key/count만 확인.
  - 결과: 런타임 및 `.env*`의 `PLANNING_*` 키 0개, Action Center migration 대상 0개.

## migration / rollback / 호환성
- 실제 workspace에는 migration 대상 embedded Action Center가 0개라 실제 apply는 수행하지 않았습니다.
- 테스트에서는 embedded-only legacy 상태를 만들고 dry-run이 파일을 만들지 않음, apply가 plan/progress 파일을 만들고 embedded를 제거함, rollback이 backup에서 embedded 상태를 복원함을 검증했습니다.
- API 응답 호환성: canonical 파일이 없고 embedded legacy가 있으면 detail/action-plan/action-progress GET은 기존 상태를 fallback으로 반환합니다.
- 저장 포맷 변화: 새 write는 `run.actionCenter`를 run meta에 중복 저장하지 않습니다. legacy 제거 apply 시 `action-center-legacy-backup.json`을 같은 run dir에 남깁니다.
- corrupted canonical 파일은 자동 덮어쓰기 대신 `NO_DATA`로 실패합니다. 이는 읽기 경로 무쓰기 계약을 우선한 호환성 변화입니다.

## 남은 리스크
- 실제 운영 데이터가 vault encrypted envelope이면 현재 inventory 스크립트는 내용을 복호화하지 않고 envelope count만 확인합니다. 이번 workspace에서는 run meta 자체가 0개였습니다.
- migration helper는 file-store 단일 프로세스 실행을 전제로 한 저장소 함수입니다. 다중 프로세스 공유 파일 저장소에서 운영 apply를 노출하려면 inter-process lock 또는 DB-backed migration state가 별도로 필요합니다.
- P1-04는 원본 단일화와 summary 조회 축소까지만 처리했습니다. 다음 문서 순서는 P1 기능 계약, provenance, desktop artifact, run application service입니다.
