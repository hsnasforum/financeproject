# 2026-03-23 N2 hybrid retained visible fileName bridge subset predicate bootstrap

## 변경 파일
- `src/lib/planning/v3/transactions/store.ts`
- `tests/planning-v3-batches-api.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/23/2026-03-23-n2-hybrid-retained-visible-fileName-bridge-subset-predicate-bootstrap.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: batch detail/helper surface 안에서 visible `fileName` compat bridge subset만 shared helper로 좁혀 드러내는 데 사용했다.
- `planning-gate-selector`: helper/test/doc 변경 round로 분류해 `pnpm test tests/planning-v3-batches-api.test.ts`, `pnpm build`, 지정된 `git diff --check -- ...`를 실행 검증으로 선택했다.
- `work-log-closeout`: 실제 수정 파일, 실행 검증, blank provenance 관련 남은 provenance-origin 리스크를 표준 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- 이전 retirement-proof audit에서 visible compat bridge debt는 `stored provenance.fileName blank + legacyBatch.fileName present` subset으로 더 좁혀졌지만, code helper에는 그 subset predicate가 아직 explicit하지 않았다.
- 이번 라운드는 backfill 구현이나 fallback 제거가 아니라, shared helper와 회귀 테스트 수준에서 visible subset predicate를 bootstrap하는 것이 목표였다.

## 핵심 변경
- `src/lib/planning/v3/transactions/store.ts`에 `hasHybridRetainedVisibleFileNameCompatBridge()`를 추가해 `hybrid-legacy-summary-retained + stored provenance blank + legacyBatch.fileName present`일 때만 visible bridge를 `true`로 판정하게 했다.
- `getStoredFirstLegacyDetailSummaryRetentionWindow()`는 새 predicate를 재사용하도록 바꿔, `blank/blank` subset을 더 이상 visible `fileName` bridge debt로 세지 않게 했다.
- `tests/planning-v3-batches-api.test.ts`는 `stored provenance present -> false`, `blank/present -> true`, `blank/blank -> false` truth table을 직접 고정했다.
- blank/blank fixture에서도 detail API output `fileName`은 계속 비어 있고 `failed/total/ok`는 기존 current rule을 유지해 current payload behavior가 바뀌지 않음을 확인했다.
- `analysis_docs/v2/13...`에는 visible subset predicate bootstrap이 helper/test에서 닫혔고, blank/blank subset은 visible debt가 아니라고 보는 current contract 메모만 최소 범위로 보강했다.

## 검증
- `pnpm test tests/planning-v3-batches-api.test.ts`
  - PASS. `25 passed`.
- `pnpm build`
  - PASS. Next.js production build completed successfully.
- `git diff --check -- src/lib/planning/v3/transactions/store.ts tests/planning-v3-batches-api.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/23/2026-03-23-n2-hybrid-retained-visible-fileName-bridge-subset-predicate-bootstrap.md`
  - PASS.
- 미실행 검증:
- `pnpm test tests/planning-v3-batch-center-api.test.ts`
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크
- current runtime은 visible bridge subset 안에서도 blank stored provenance의 origin이 정상 optional-input omission인지 historical handoff gap인지 구분할 explicit stored marker를 여전히 갖고 있지 않다. [미확인]
- 이번 bootstrap은 visible bridge debt subset만 explicit하게 만든 것이지, provenance-only backfill이나 `fileName` fallback retirement 조건을 닫은 것은 아니다.
- verified-success response shell도 같은 helper stack을 재사용하므로, future cut은 이 predicate를 reuse하되 route-local 분기나 broad backfill로 확장하지 않도록 주의가 필요하다.
