## 변경 파일
- 코드 수정 없음
- `work/3/13/2026-03-13-planning-v3-balances-read-wrapper-alignment.md`

## 변경 이유
- 직전 `draft/profile store wrapper alignment` 다음 isolated wrapper batch로 `accounts/opening-balances/balances-monthly` read-side wrapper만 따로 잠그는 편이 가장 작고 안전했다.
- 이 3개 wrapper는 실제 read route에서 이미 import 중이고, `transactions write/import/merge`, `batches write/import`, `categories alias`, `ops/migrate`, `goldenPipeline`로 범위를 넓히지 않고도 현재 계약을 설명할 수 있었다.
- `work/3/13/2026-03-13-planning-v3-store-helper-next-batch-breakdown.md`의 `ops/migrate` 추천보다 먼저 연 이유는, 현재 dirty 상태에서 read-side wrapper import surface가 이미 route 계약 일부이기 때문이다.
- 현재 브랜치 `pr37-planning-v3-txn-overrides`는 이번 `balances-read wrapper alignment` 배치 축과 계속 어긋난다.

## 사용 skill
- `planning-gate-selector`: 이번 라운드 검증 세트를 사용자 지정 범위에 맞춰 그대로 잠금
- `work-log-closeout`: `/work` 마감 기록 형식 정리

## wrapper 성격
- `src/lib/planning/v3/accounts/store.ts`: pure alias. `../store/accountsStore` re-export만 수행한다.
- `src/lib/planning/v3/openingBalances/store.ts`: pure alias. `../store/openingBalancesStore` re-export만 수행한다.
- `src/lib/planning/v3/balances/monthly.ts`: thin composition. 월별 잔액 read route가 쓰는 계산/조회 helper를 한 경로로 모으지만, route 의미를 새로 만드는 별도 로직 surface까지는 가지 않았다.
- 조건부 확인한 `src/lib/planning/v3/transactions/store.ts`는 `balances/monthly`에서 `getBatchTransactions` read helper 의존성 설명용으로만 확인했다. write/import/merge 축은 이번 라운드 범위에 포함하지 않았다.

## 실제 import surface
- `src/app/api/planning/v3/accounts/route.ts` -> `@/lib/planning/v3/accounts/store`
- `src/app/api/planning/v3/accounts/[id]/route.ts` -> `@/lib/planning/v3/accounts/store`
- `src/app/api/planning/v3/accounts/[id]/starting-balance/route.ts` -> `@/lib/planning/v3/accounts/store`
- `src/app/api/planning/v3/opening-balances/route.ts` -> `@/lib/planning/v3/openingBalances/store`
- `src/app/api/planning/v3/balances/monthly/route.ts` -> `@/lib/planning/v3/balances/monthly`
- 포함 route 5개 기준으로는 wrapper 경로와 legacy internal path가 다시 섞인 지점이 없었다.
- 포함 테스트 3개도 route contract 검증 기준으로는 현재 wrapper surface와 충돌하지 않았다. 일부 fixture/setup은 legacy 구현 경로를 직접 쓰지만, 이번 read-side route import surface drift로 보지는 않았다.

## 이번 라운드 정리 결과
- `accounts/store`, `openingBalances/store`는 pure alias 상태를 그대로 유지해도 caller route 계약이 안정적이다.
- `balances/monthly`는 read-side composition wrapper로 이미 충분히 설명 가능했고, 현재 route가 wrapper 한 경로만 사용하므로 추가 정렬 수정이 필요하지 않았다.
- 따라서 이번 배치는 코드 churn 없이 audit + 검증 + `/work` 잠금으로 마감했다.

## 실행한 검증
- 기준선 확인
  - `work/3/13/2026-03-13-planning-v3-draft-profile-store-wrapper-alignment.md`
  - `work/3/13/2026-03-13-planning-v3-store-helper-next-batch-breakdown.md`
  - `work/3/13/2026-03-13-planning-v3-api-contract-followup.md`
  - `work/3/13/2026-03-13-planning-v3-user-facing-contract-followup.md`
- 상태 잠금
  - `git status --short -- src/lib/planning/v3/accounts/store.ts src/lib/planning/v3/openingBalances/store.ts src/lib/planning/v3/balances/monthly.ts src/app/api/planning/v3/accounts/route.ts src/app/api/planning/v3/accounts/[id]/route.ts src/app/api/planning/v3/accounts/[id]/starting-balance/route.ts src/app/api/planning/v3/opening-balances/route.ts src/app/api/planning/v3/balances/monthly/route.ts tests/planning-v3-balances-api.test.ts tests/planning-v3-accounts-profile-remote-host-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts`
- 테스트
  - `pnpm exec vitest run tests/planning-v3-balances-api.test.ts tests/planning-v3-accounts-profile-remote-host-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts`
- lint
  - `pnpm exec eslint src/lib/planning/v3/accounts/store.ts src/lib/planning/v3/openingBalances/store.ts src/lib/planning/v3/balances/monthly.ts src/app/api/planning/v3/accounts/route.ts src/app/api/planning/v3/accounts/[id]/route.ts src/app/api/planning/v3/accounts/[id]/starting-balance/route.ts src/app/api/planning/v3/opening-balances/route.ts src/app/api/planning/v3/balances/monthly/route.ts tests/planning-v3-balances-api.test.ts tests/planning-v3-accounts-profile-remote-host-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts`
- build
  - `pnpm build`

## 미실행 검증
- `pnpm exec vitest run tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
  - read-side wrapper mismatch가 account/cashflow guard까지 번지지 않아 제외했다.
- `pnpm e2e:rc`
- `pnpm release:verify`
- `pnpm planning:v2:complete`
- `pnpm planning:current-screens:guard`

## 남은 리스크와 엣지케이스
- 현재 wrapper 3개와 caller route 계약은 맞지만, dirty branch에서 wrapper 파일 자체가 아직 별도 정리 중인 축이므로 추후 배치에서 write-side wrapper와 섞어 다시 흔들지 않도록 범위 잠금이 계속 필요하다.
- `balances/monthly`는 read-side composition wrapper로 충분히 좁지만, 내부에서 참조하는 `transactions/store`가 read/write helper를 함께 담고 있어 미래에 더 세밀한 wrapper 분리가 필요할 수 있다. 이번 라운드 blocker는 아니다.

## 다음 라운드 우선순위
- 우선순위 1: 남은 isolated wrapper 중 write/import 축 또는 내부-only 축을 별도 batch로 다시 고르고, 이번 read-side 범위는 재오픈하지 않는다.
- 우선순위 2: 다음 batch에서도 `transactions write/import/merge`, `batches write/import`, `categories alias`, `ops/migrate`, `goldenPipeline`를 한 번에 섞지 않고 한 축만 잠근다.

## 이번 라운드 완료 항목
- read-side wrapper 3개 역할 audit 완료
- caller route 5개 import surface 확인 완료
- 관련 테스트/lint/build 검증 완료
- 코드 수정 없이 현재 계약을 `/work`로 잠금
