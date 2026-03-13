# 2026-03-13 planning-v3 txn-overrides follow-through audit

## 변경 파일
- `src/app/planning/v3/transactions/[id]/_components/TransactionBatchDetailClient.tsx`
- `tests/e2e/flow-v3-import-to-cashflow.spec.ts`
- `work/3/13/2026-03-13-planning-v3-txn-overrides-followthrough-audit.md`

## audit에 포함한 파일
- `src/app/api/planning/v3/batches/[id]/txn-overrides/route.ts`
- `src/app/api/planning/v3/transactions/account-overrides/route.ts`
- `src/app/api/planning/v3/transactions/transfer-overrides/route.ts`
- `tests/planning-v3-batch-txn-overrides-api.test.ts`
- `tests/planning-v3-account-overrides-api.test.ts`
- `tests/planning-v3-transfer-overrides-api.test.ts`
- `tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
- `[조건부 읽기만] src/app/api/planning/v3/transactions/batches/[id]/cashflow/route.ts`
- `[조건부 읽기만] src/lib/planning/v3/store/txnOverridesStore.ts`

## 제외 파일
- `accounts` 전체
- `balances` 전체
- `batches list/summary` 전체
- `draft/profile` 전체
- `import/csv` 전체
- `profiles` 전체
- `news/settings`
- `indicators`
- `quickstart`
- `home`
- `reports`
- `저장모델 변경`
- `route 추가`
- `docs 대량 수정`
- `pnpm e2e:rc`, `pnpm planning:v2:complete`, `pnpm planning:current-screens:guard`

## 사용 skill
- `planning-gate-selector`: `batch detail override follow-through` audit에 맞춰 API/unit test, 실제 변경 파일 eslint, build, 좁은 e2e만 실행하도록 검증 범위를 고르기 위해 사용
- `work-log-closeout`: audit 결론, 실제 수정 파일, 실행한 검증과 미실행 검증, 다음 라운드를 `/work` 형식으로 남기기 위해 사용

## 변경 이유
- 최신 기준선은 `work/3/13/2026-03-13-planning-v3-news-settings-section-status-audit.md`였고, 이번 라운드는 `transactions/accounts` 전체가 아니라 `batch detail override follow-through`만 다시 보는 별도 배치로 시작했습니다.
- 현재 브랜치가 `pr37-planning-v3-txn-overrides`라 같은 브랜치에서 이어가는 것이 자연스럽지만, 범위는 `TransactionBatchDetailClient`와 실제 caller가 있는 override route 3개, 좁은 e2e 1건으로 다시 잠갔습니다.
- 정적 audit 결과, 남아 있던 문제는 route 계약보다 batch detail UI 쪽이었습니다.
  - 저장 success 문구와 아래 집계/캐시플로우 재계산 의미가 분리돼 있지 않았습니다.
  - transfer override 버튼은 현재 상태처럼 읽히는 라벨이라 실제 저장 동작을 추측해야 했습니다.
  - 카테고리 breakdown 재조회 실패는 조용히 비워져 partial 실패가 완료처럼 보일 수 있었습니다.

## 핵심 변경
- `TransactionBatchDetailClient`의 거래 정정 섹션 설명을 `오버라이드 저장`과 `아래 집계/캐시플로우 자동 재계산`으로 분리해 적었습니다.
- success notice를 `저장 완료`와 `자동 재계산 진행` 의미로 맞췄습니다.
  - `거래 분류 오버라이드`
  - `거래 계좌 매핑`
  - `이체 판정`
  - `배치 계좌 연결`
- row action 버튼 라벨도 경로별 의미가 드러나도록 정리했습니다.
  - `계좌 저장`
  - `분류 저장`
  - `이체로 저장` / `일반으로 저장`
- `categorized` 재조회 실패를 숨기지 않도록 `categorizedMessage`를 추가해 partial 실패가 완료처럼 보이지 않게 했습니다.
- route 3개와 `cashflow` route는 read-only audit 결과, success/error contract 자체는 이번 follow-through 문제의 직접 원인이 아니어서 수정하지 않았습니다.
- `tests/e2e/flow-v3-import-to-cashflow.spec.ts`는 단순 진입 확인에서 끝나지 않고, batch detail 안에서
  - override 설명 문구
  - account override save
  - txn override save
  - transfer override save
  - follow-through notice
  까지 확인하도록 좁게 보강했습니다.

## 검증
- `pnpm exec vitest run tests/planning-v3-batch-txn-overrides-api.test.ts tests/planning-v3-account-overrides-api.test.ts tests/planning-v3-transfer-overrides-api.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
  - PASS
- `pnpm exec eslint src/app/planning/v3/transactions/[id]/_components/TransactionBatchDetailClient.tsx tests/e2e/flow-v3-import-to-cashflow.spec.ts`
  - PASS
- `pnpm build`
  - PASS
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-v3-import-to-cashflow.spec.ts --workers=1`
  - 1차 FAIL: 두 번째 계좌 생성 전에 `계좌 생성` 버튼이 아직 `생성 중...` 상태라 spec 타이밍이 앞섰음
  - 2차 FAIL: 고정 계좌명 텍스트가 누적 데이터와 겹쳐 strict locator가 여러 개 잡힘
  - 3차 FAIL: e2e가 `txn override`에 `saving` category를 넣어 store validation 400을 유발함
  - spec을 `버튼 재활성화 대기 + 고유 계좌명 + 유효 category` 기준으로 보정한 뒤 PASS
- `git diff --check -- src/app/planning/v3/transactions/[id]/_components/TransactionBatchDetailClient.tsx tests/e2e/flow-v3-import-to-cashflow.spec.ts work/3/13/2026-03-13-planning-v3-txn-overrides-followthrough-audit.md`
  - PASS

## 미실행 검증
- `pnpm e2e:rc`
  - 미실행. 이번 라운드는 새 route/href/current-screens 변경이 없고, `flow-v3-import-to-cashflow` 1건을 follow-through 기준으로 좁혀 재검증했습니다.
- `pnpm planning:v2:complete`
  - 미실행. `planning-v2` 엔진/완료 기준과 무관한 `planning-v3 batch detail override` audit 라운드였습니다.
- `pnpm planning:current-screens:guard`
  - 미실행. route catalog, href, current-screens 문서를 바꾸지 않았습니다.

## 남은 리스크
- 이번 라운드에서 `batch detail override follow-through`의 실제 오해 지점은 정리했지만, per-row dirty 계산은 아직 없습니다. 같은 값을 다시 저장해도 성공 notice는 나올 수 있습니다.
- `categorized` 재조회 실패는 이제 드러나지만, 상세한 원인 분기나 재시도 UX까지는 이번 배치 범위가 아닙니다.
- route/store 계약은 그대로 두었기 때문에, 향후 `saving`/`invest` 같은 legacy category를 batch detail UI에서 직접 노출할지 여부는 별도 배치로 다뤄야 합니다.

## 다음 라운드
- `transactions/accounts` 후속은 실제 사용자 오해가 남아 있다면 `per-row dirty/disable` 한 축만 별도 배치로 자릅니다.
- 그렇지 않으면 다음 라운드는 다른 `planning-v3` dirty bucket으로 넘어가고, `balances/drafts/profiles`로는 이번 흐름에서 확장하지 않습니다.
