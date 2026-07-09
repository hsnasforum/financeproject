# 2026-07-01 Planning run store 책임 분리

## 대상 Issue
- GitHub Issue: https://github.com/hsnasforum/financeproject/issues/116
- 우선순위 항목: 3. Planning run store 책임 분리

## 사용 skill
- planning-gate-selector: Planning store/route 영향 변경에 필요한 검증 범위 선정
- work-log-closeout: 변경 파일, 검증 결과, 잔여 리스크 종료 기록

## 수정 대상 파일
- `src/lib/planning/store/runStore.ts`
- `src/lib/planning/store/runBlobStore.ts`
- `src/lib/planning/store/runLegacyBackfillService.ts`
- `tests/planning-store.test.ts`
- `tests/planning/runBlobStore.test.ts`

## 변경 이유
- `runStore.ts`가 run CRUD, 목록/index, stage blob, legacy backfill, 삭제/복구, journal cleanup까지 과도하게 들고 있어 변경 위험과 테스트 범위가 커졌습니다.
- 기존 파일 기반 저장소와 외부 export 계약은 유지하면서 stage blob 처리와 legacy backfill 판단을 분리해 단위 테스트 가능한 경계를 만들었습니다.
- `getRun`은 기존처럼 읽을 수 없는 run meta를 `null`로 처리하되, 최소 진단 경로에서는 missing과 unreadable을 구분할 수 있게 했습니다.

## 핵심 변경
- stage blob 이름 정규화, 쓰기, 읽기, output ref 부착을 `runBlobStore.ts`로 분리했습니다.
- legacy backfill 요약, 후보 산출, backfill 실행 흐름을 dependency-injected `runLegacyBackfillService.ts`로 분리했습니다.
- `runStore.ts`는 기존 `listRuns`, `getRun`, `createRun`, `updateRun`, `deleteRun`, `getRunBlob` export를 유지하고 새 하위 모듈을 조합하도록 정리했습니다.
- `diagnoseRunRead(id, profileIdHint?)`를 추가해 missing과 unreadable meta를 최소 경로에서 구분합니다.
- stage blob 순수 로직 테스트와 unreadable meta 진단 회귀 테스트를 추가했습니다.

## 확인 명령과 결과
- `rg -n -F -e listRuns\\( -e getRun\\( -e createRun\\( -e updateRun\\( -e deleteRun\\( -e getRunBlob\\( src tests scripts` PASS: 주요 export 사용처를 확인했습니다.
- `corepack pnpm typecheck` PASS
- `corepack pnpm planning:v2:engine:guard` PASS
- `corepack pnpm planning:v2:guard` PASS
- `corepack pnpm test tests/planning/runBlobStore.test.ts tests/planning-store.test.ts` PASS: 2 files, 19 tests
- `corepack pnpm test tests/planning-store-concurrency.test.ts tests/planning/storage-consistency-recovery.test.ts tests/planning-v2-api/persistence-routes.test.ts tests/planning-v2-api/run-blob-route.test.ts tests/planning/store/planningStoreNamespace.test.ts` PASS: 5 files, 22 tests
- `corepack pnpm planning:v2:compat` PASS
- `corepack pnpm lint` PASS
- `corepack pnpm planning:v2:complete` PASS
- `corepack pnpm planning:v2:regress` PASS
- `corepack pnpm test` PASS: 742 files, 2455 tests
- `corepack pnpm release:verify` PASS
- `corepack pnpm build` PASS
- `git diff --check -- src/lib/planning/store/runStore.ts src/lib/planning/store/runBlobStore.ts src/lib/planning/store/runLegacyBackfillService.ts tests/planning-store.test.ts tests/planning/runBlobStore.test.ts` PASS

## 실패 후 해소한 명령
- `corepack pnpm typecheck` 1차 실패: 새 blob 모듈의 `engine` 타입 가드와 테스트 fixture 타입이 맞지 않았습니다. `isEngineEnvelopeLike`와 fixture 보정 후 PASS를 확인했습니다.
- `corepack pnpm release:verify` 1차 실행은 304초 제한으로 종료 상태를 확인하지 못했습니다. 로그 캡처 방식으로 재실행해 PASS를 확인했습니다.
- 사용처 `rg` 명령 2회 실패: PowerShell/WSL quoting이 괄호 패턴을 잘못 해석했습니다. 괄호를 셸 이스케이프한 고정 문자열 검색으로 재실행해 PASS를 확인했습니다.

## 남은 리스크와 엣지케이스
- legacy route/API 삭제나 alias 제거는 이번 범위가 아닙니다. telemetry/access log와 실제 사용처 확인 전 확정하면 안 됩니다.
- `diagnoseRunRead`는 최소 진단 경로를 제공하지만, ops 화면이나 API 응답으로 노출하는 작업은 별도 Issue 범위입니다.
- 기존 저장소 파일 포맷과 public API 계약은 유지했습니다. stage blob 파일 자체가 손상된 경우 `getRunBlob`의 기존 null fallback 동작은 그대로 유지했습니다.
- 다음 우선순위는 Issue #117 Planning create run service orchestration 절단입니다.
