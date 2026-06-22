# 2026-06-22 Ops source actions

## 변경 파일
- `src/lib/dev/fixCatalog.ts`
- `src/lib/dev/runScript.ts`
- `src/lib/ops/actions/types.ts`
- `src/lib/ops/actions/registry.ts`
- `tests/run-script-sanitize.test.ts`
- `tests/planning/ops/ops-source-actions.test.ts`
- `docs/daily-refresh.md`
- `docs/runbook.md`
- `work/6/22/2026-06-22-ops-source-actions.md`

## 사용 skill
- `finance-skill-routing`: Ops/Data Freshness 라운드의 조건부 skill 조합을 선택했습니다.
- `planning-gate-selector`: ops action, run script allowlist, 문서 변경에 맞춰 targeted vitest, lint, typecheck, guard를 선택했습니다.
- `dart-data-source-hardening`: public source refresh가 env/upstream 실패를 성공처럼 보이지 않게 처리하는지 점검했습니다.
- `work-log-closeout`: 변경 파일, 실제 검증, 남은 리스크를 종료 기록으로 정리합니다.

## 변경 이유
- `daily:refresh`에는 FinLife, DataGo, Gov24, news, indicators가 포함됐지만 operator가 개별 source refresh를 ops action 경계에서 실행할 수 있는 allowlist는 부족했습니다.
- 목표의 runOpsJob 적용 범위는 현재 코드 기준 `runOpsAction`/`runAllowedFix` 경계와 대응되므로, 개별 source 스크립트를 같은 경계에 노출해야 합니다.
- 알 수 없는 command 실행은 계속 차단하면서, 문서화된 public source refresh만 명시적으로 허용해야 합니다.

## 핵심 변경
- `FINLIFE_SYNC_IF_STALE`, `DATAGO_SYNC`, `GOV24_SYNC_IF_STALE`, `NEWS_REFRESH`, `INDICATORS_REFRESH` fix/action id를 추가했습니다.
- source action preview와 run이 기존 `runAllowedFix` allowlist를 통하도록 registry를 확장했습니다.
- allowlist와 ops source action 매핑 단위 테스트를 추가했습니다.
- `docs/daily-refresh.md`와 `docs/runbook.md`의 daily refresh 단계와 실패 원인을 최신화했습니다.

## 검증
- PASS: `./node_modules/.bin/vitest run tests/run-script-sanitize.test.ts tests/planning/ops/ops-source-actions.test.ts tests/planning/ops/actions-types.test.ts` (3 files, 9 tests)
- PASS: `./node_modules/.bin/vitest run tests/planning/ops/ops-action-result-status.test.ts` (1 file, 3 tests)
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- FAIL→PASS: `corepack pnpm multi-agent:guard` (초기 실패: latest `/work` note에 `다음 라운드` 누락)
- PASS: `git diff --check`

## 남은 리스크
- live source refresh는 외부 API key와 upstream 상태에 따라 달라 이번 라운드에서는 실행하지 않습니다.
- production scheduler나 `.data/ops/jobs` 파일 큐 구조는 변경하지 않았습니다.

## 다음 라운드
- source별 live smoke 또는 `daily:refresh:strict` 증거로 stale freshness snapshot 8건을 해소할지 확인합니다.
- `.data/ops/jobs` 파일 큐를 유지한 상태에서 source action 실행 로그가 operator 화면에서 충분히 구분되는지 점검합니다.
