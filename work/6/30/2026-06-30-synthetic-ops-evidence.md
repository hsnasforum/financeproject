# 2026-06-30 합성 legacy ops evidence 보강

## 변경 파일
- `tests/planning/ops-safety.test.ts`
- `scripts/planning_v2_ops_safety.mjs`
- `docs/planning-v2-ops.md`
- `work/6/29/2026-06-29-0629-delivery-completion-audit.md`
- `work/6/29/2026-06-29-0629-delivery-final-report-draft.md`
- `work/6/30/2026-06-30-synthetic-ops-evidence.md`

## 사용 skill
- `planning-gate-selector`: ops safety 스크립트와 테스트 변경에 필요한 최소 검증 범위를 고르기 위해 사용했습니다.
- `work-log-closeout`: 실제 실행한 명령, 실패 선행 증거, 남은 blocker를 `/work`에 분리해 기록하기 위해 사용했습니다.

## 변경 이유
- GitHub billing 문제가 해결될 때까지 commit/push/PR이 금지되어 원격 CI 증거는 확보하지 않았습니다.
- 운영 데이터 접근 없이도 local-only로 검증 가능한 evidence를 보강하기 위해 합성 legacy run fixture를 실제 file-backed runStore에 생성했습니다.
- 기존 apply 모드는 백필 전 후보 수를 threshold로 판단해, `legacy-fail-threshold=0`에서 정상 백필 후에도 실패할 수 있었습니다.
- apply 모드에서 백필 후 inventory를 다시 집계하고, 적용 후 후보 수(`postApplyCandidateCount`)를 기준으로 PASS/FAIL을 판단하도록 했습니다.

## 핵심 변경
- 합성 multi-user namespaced 임시 저장소에 legacy `resultDto` only run을 만들고, check/apply/check 흐름을 검증하는 테스트를 추가했습니다.
- `planning:v2:ops:safety` apply 리포트에 `postApplySummary`, `postApplyCandidateCount`, `postApplyCandidatesSample`, `postApplyOverThreshold`를 기록합니다.
- CLI 출력에 `postApplyLegacyCandidates`를 추가했습니다.
- 운영 문서에 apply 모드가 적용 후 후보 수를 기준으로 통과한다는 점을 반영했습니다.
- 6월 29일 최종 보고서 초안과 완료 감사 문서에 6월 30일 합성 증거를 반영했습니다.

## 검증
- 수정 전 실패: `corepack pnpm test tests/planning/ops-safety.test.ts` FAIL, 1 file / 6 tests 중 1 failed.
  - 실패 위치: `uses synthetic file-backed legacy data to report post-apply inventory`
  - 실패 이유: apply 모드가 백필 전 `candidateCount=1`과 `legacy-fail-threshold=0`을 기준으로 `apply.ok=false`를 반환했습니다.
- 수정 후 성공: `corepack pnpm test tests/planning/ops-safety.test.ts` PASS, 1 file / 6 tests.
- `node --check scripts/planning_v2_ops_safety.mjs` PASS.
- `corepack pnpm test tests/planning/ops-safety.test.ts tests/planning-store.test.ts` PASS, 2 files / 22 tests.
- `corepack pnpm typecheck` PASS.
- `corepack pnpm lint` PASS.
- `git diff --check -- scripts/planning_v2_ops_safety.mjs tests/planning/ops-safety.test.ts docs/planning-v2-ops.md` PASS.
- `corepack pnpm planning:v2:ops:safety -- --legacy-mode=check --legacy-limit=500 --legacy-fail-threshold=-1` PASS.
  - `opsRun=PASS`
  - `legacyBackfill=PASS`
  - `legacyCandidates=0`
  - report `.data/planning/ops/reports/20260630-041311-safety.json`
  - log `.data/planning/ops/logs/20260630-041311-safety.log`

## 남은 리스크
- [deferred GitHub publishing] commit/push/PR은 현재 범위 밖입니다.
- [deferred external verification] 원격 CI 증거는 현재 범위 밖입니다.
- [deferred external verification] 실제 운영 legacy inventory, migration 대상 수, conflict 수, quarantine 수는 현재 범위 밖입니다.
- [검증 필요] 합성 데이터는 file-backed 로컬 동작 증거이며, production topology 자체를 증명하지는 않습니다.
- [검증 필요] 다중 프로세스 공유 파일 저장소의 완료 보장은 여전히 `topology.sharedFileStoreCompletion=not_proven`으로 남깁니다.
