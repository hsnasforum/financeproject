# 2026-03-20 N2 batch detail stats source parity clarification

## 변경 파일

- `src/lib/planning/v3/transactions/store.ts`
- `src/app/api/planning/v3/transactions/batches/[id]/route.ts`
- `tests/planning-v3-batches-api.test.ts`
- `work/3/20/2026-03-20-n2-batch-detail-stats-source-parity.md`

## 사용 skill

- `planning-gate-selector`: batch detail route의 `stats` source semantics 명시화 범위에 맞춰 `tests/planning-v3-batches-api.test.ts`, `tests/planning-v3-getBatchSummary.test.ts`, `pnpm build`, `git diff --check`만 실행하는 최소 검증 세트를 고르는 데 사용
- `work-log-closeout`: 실제 수정 파일, 실행한 명령, `stats`의 mixed source semantics와 잔여 리스크를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- 직전 라운드에서 `stats.total/ok/failed`는 legacy summary fallback을, `stats.inferredMonths`는 row aggregation을 읽는 현재 동작은 유지했지만, route 본문과 테스트 이름만 보면 이 mixed source semantics가 충분히 드러나지 않았다.
- 이번 라운드는 `stats`를 한 source로 강제하지 않고, source가 다를 수 있다는 사실을 helper 주석, 변수명, 테스트 이름에서 더 읽히게 만드는 것이 목적이었다.

## 핵심 변경

- `transactions/store.ts`의 `getStoredFirstLegacyDetailSummaryFallback()` 주석에 이 fallback이 detail route의 summary/count 계열 필드에만 쓰이고 row-derived projection에는 쓰이지 않는다는 점을 명시했다.
- batch detail route의 `toBatchDetailStats()`는 `monthsSummary` 파라미터 이름을 `rowMonthsSummary`로 바꿨고, 함수 주석에 `total/ok/failed`는 legacy summary fallback을 읽을 수 있지만 `inferredMonths`는 raw/recovered row aggregation을 읽는다는 점을 적었다.
- route 본문도 `rowMonthsSummary`라는 이름으로 응답 `monthsSummary`와 `stats.inferredMonths`의 공통 source를 더 읽히게 맞췄다.
- hybrid snapshot detail 테스트 이름을 `legacy summary counts`와 `recovered rows month inference`가 함께 드러나도록 바꾸고, `stats.total/ok/failed`와 `stats.inferredMonths` assertion을 분리해 mixed source semantics를 잠갔다.
- `getBatchSummary` 코드 자체는 바꾸지 않았지만, shared helper 파일을 건드린 만큼 summary targeted test를 같이 돌려 회귀가 없는지 확인했다.

## 검증

- 실행한 확인
- `pnpm test tests/planning-v3-batches-api.test.ts`
- `pnpm test tests/planning-v3-getBatchSummary.test.ts`
- `pnpm build`
- `git diff --check -- src/app/api/planning/v3/transactions/batches/[id]/route.ts src/lib/planning/v3/transactions/store.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-getBatchSummary.test.ts work/3/20/2026-03-20-n2-batch-detail-stats-source-parity.md`
- 미실행 검증
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크

- `stats`는 여전히 single-source field가 아니다. `total/ok/failed`와 `inferredMonths`의 source가 다를 수 있다는 계약을 더 읽히게 했을 뿐, 이를 구조적으로 분리한 것은 아니다.
- `batch.createdAt` 빈 문자열 downgrade와 raw `data` vs derived projection 차이는 직전 라운드 상태 그대로 남아 있다.
- `getBatchSummary`는 이번 라운드에서 코드 변경이 없으므로, detail route와 완전히 같은 설명용 helper naming을 공유하는 수준까지는 아직 가지 않았다.
