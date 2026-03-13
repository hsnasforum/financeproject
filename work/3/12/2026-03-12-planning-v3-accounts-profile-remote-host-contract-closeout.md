# 2026-03-12 planning-v3 accounts profile remote-host contract closeout

## 변경 파일
- `tests/planning-v3-write-route-guards.test.ts`
- `tests/planning-v3-accounts-profile-remote-host-api.test.ts`

## 사용 skill
- `planning-gate-selector`: 이번 라운드를 `planning-v3 accounts/profile draft same-origin remote-host 계약` 테스트 배치로 좁히고, `vitest + eslint`만 실행하도록 검증 범위를 고르는 데 사용
- `work-log-closeout`: 실제 추가한 테스트 계약, 중간 실패 원인, 최종 PASS 결과를 `/work` 형식으로 정리하는 데 사용

## 변경 이유
- `planning-v3 internal-only route` 배치를 닫은 뒤 남아 있던 최소 실제 공백은 user-facing GET 경로의 remote-host 회귀 테스트였습니다.
- 실제 UI caller가 있는 `accounts`, `opening-balances`, `profile/draft`, `profile/drafts`, `profile/drafts/[id]`는 기존 테스트가 mostly localhost happy-path 중심이었고, same-origin remote-host 계약이 별도 파일로 고정돼 있지 않았습니다.
- 추가로 `profile/drafts/[id]/apply`, `profile/drafts/[id]/preflight`는 user-facing write route인데 `planning-v3-write-route-guards`의 runtime target에는 빠져 있었습니다.

## 핵심 변경
- `tests/planning-v3-write-route-guards.test.ts`에 아래 runtime target 2개를 추가했습니다.
  - `profile/drafts/[id]/apply` `POST`
  - `profile/drafts/[id]/preflight` `POST`
  - same-origin remote host에서는 403이 아니고, cross-origin은 기존 guard 테스트로 계속 차단되는지 고정
- `tests/planning-v3-accounts-profile-remote-host-api.test.ts`를 추가했습니다.
  - `GET /api/planning/v3/accounts`
  - `GET /api/planning/v3/opening-balances`
  - `GET /api/planning/v3/profile/draft`
  - `GET /api/planning/v3/profile/drafts`
  - `GET /api/planning/v3/profile/drafts/[id]`
  - 위 경로들이 same-origin remote host에서는 200을 유지하고, cross-origin에서는 `ORIGIN_MISMATCH`를 반환하는지 고정
- 1차 재검증에서 `expectOriginMismatch`가 `Promise<Response>`를 바로 받아 status가 `undefined`가 되는 테스트 헬퍼 버그가 있었고, 헬퍼를 `await`하도록 수정한 뒤 PASS로 정리했습니다.

## 검증
- `pnpm test tests/planning-v3-write-route-guards.test.ts tests/planning-v3-accounts-profile-remote-host-api.test.ts tests/planning-v3-opening-balances-api.test.ts tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts tests/planning-v3-profile-draft-v2-api.test.ts`
  - PASS
- `pnpm exec eslint tests/planning-v3-write-route-guards.test.ts tests/planning-v3-accounts-profile-remote-host-api.test.ts`
  - PASS
- `pnpm test tests/planning-v3-write-route-guards.test.ts tests/planning-v3-accounts-profile-remote-host-api.test.ts`
  - 1차 FAIL: `expectOriginMismatch` 헬퍼가 `Promise<Response>`를 바로 받아 `status`가 `undefined`
  - 헬퍼 수정 후 PASS

## 남은 리스크
- 이번 라운드 범위의 `planning-v3 accounts/profile draft remote-host 계약` blocker는 없습니다.
- 현재 남은 것은 route guard가 아니라 큰 dirty bucket 분리입니다. 특히 `planning-v3`의 `news/indicators`, `transactions/accounts`, `draft/profile`을 서로 섞지 않고 더 작은 기능 배치로 나눌 필요가 있습니다.
- `other` 혼합 bucket은 여전히 가장 크므로, 다음 라운드는 DART/data-source, recommend/products, docs/runtime 보조축으로 다시 분리하는 쪽이 우선입니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
