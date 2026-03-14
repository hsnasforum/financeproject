# 2026-03-14 planning-v3 ops-migrate-golden-pipeline contract

## 변경 파일
- `planning/v3/ops/migrate.test.ts`
- `planning/v3/qa/goldenPipeline.test.ts`
- `work/3/14/2026-03-14-planning-v3-ops-migrate-golden-pipeline-contract.md`

## 사용 skill
- `planning-gate-selector`: internal logic/test 배치로 분류하고 `targeted vitest`, 조건부 `doctor.test.ts`, touched-file `eslint`, `git diff --check`만 실행하도록 검증 범위를 잠그는 데 사용
- `work-log-closeout`: 실제 변경이 test-only였다는 점, 조건부 doctor 확인 여부, 실행/미실행 검증, 다음 우선순위를 `/work` 형식으로 남기는 데 사용

## 변경 이유
- latest note `work/3/14/2026-03-14-planning-v3-news-explore-freshness-contract.md`가 이번 배치를 다음 구현 1순위로 남겼다.
- 정적 스캔 결과 `planning/v3/ops/migrate.ts`는 apply 시 `runV3Doctor()` 결과를 축약한 `doctor` summary만 반환하고, `planning/v3/qa/goldenPipeline.test.ts`는 fixture 기반 semantic golden baseline만 검증한다.
- 즉 runtime mismatch는 보이지 않았고, 실제 부족한 부분은 `migrate` preview/apply/schemaVersion/doctor summary 계약과 golden baseline의 metadata 비의존성을 테스트로 명시하지 않은 점이었다.
- 이번 라운드는 production 로직을 건드리지 않고 internal contract를 테스트로 고정하는 최소 수정으로 닫는 것이 맞았다.

## 핵심 변경
- `planning/v3/ops/migrate.test.ts`에서 preview 결과가 `doctor` summary를 포함하지 않는다는 점과 `.data/news/state.json`의 `schemaVersion` 추가 step(`add_schema_version_v1`)을 명시적으로 고정했다.
- `planning/v3/ops/migrate.test.ts`에서 apply 이후 `summary.doctor`가 실제 `runV3Doctor({ cwd })`의 `ok/errors/warnings` 축약값과 정확히 일치하는지 검증하도록 바꿨다.
- `planning/v3/qa/goldenPipeline.test.ts`에 golden baseline이 `mode`, `totals`, `issues`, `doctor`, `backupPath`, `checkedAt`, `schemaVersion` 같은 migration metadata에 의존하지 않는다는 회귀 테스트를 추가했다.
- 조건부 포함으로 `planning/v3/ops/doctor.ts`, `planning/v3/ops/doctor.test.ts`를 읽었고, `migrate.ts`의 `summary.doctor`가 `runV3Doctor().counts`를 직접 축약한다는 점만 확인했다. doctor 파일 자체는 수정하지 않았다.
- `planning/v3/ops/migrate.ts`와 golden pipeline runtime 로직은 변경하지 않았다. 이번 배치에서 실제 조정은 contract test 보강만 필요했다.

## 검증
- 실행한 검증
  - `pnpm exec vitest run planning/v3/ops/migrate.test.ts planning/v3/qa/goldenPipeline.test.ts`
  - `pnpm exec vitest run planning/v3/ops/doctor.test.ts`
  - `pnpm exec eslint planning/v3/ops/migrate.ts planning/v3/ops/migrate.test.ts planning/v3/qa/goldenPipeline.test.ts`
- 미실행 검증
  - `pnpm build`
  - `pnpm e2e:rc`

## 남은 리스크
- [blocked] `migrate`와 `goldenPipeline`은 여전히 직접 runtime join point를 공유하지 않는다. 이번 라운드는 "서로 어긋나지 않는다"는 사실을 테스트로 잠갔을 뿐, 둘을 하나의 공용 산출물 계약으로 통합하지는 않았다.
- golden baseline은 fixture semantic output만 본다. 향후 persisted artifact 자체를 golden baseline에 포함하려면 별도 배치로 snapshot 범위를 다시 설계해야 한다.
- doctor summary는 `ok/errors/warnings`만 축약한다. `checks/files/summaries/issues`까지 migrate output에 노출해야 하는 요구가 생기면 별도 contract change가 필요하다.

## 다음 라운드 우선순위
1. `planning-v3 draft-profile user-facing surface`
2. `[가정] planning-v3 news search-refresh storage join point`
3. `planning-v3 txn-accounts-batches surface`
