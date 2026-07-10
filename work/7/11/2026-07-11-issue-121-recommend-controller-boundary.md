# 2026-07-11 Issue #121 추천 controller 경계 분리

## 연결 범위

- Issue: https://github.com/hsnasforum/financeproject/issues/121
- follow-up 범위 코멘트: https://github.com/hsnasforum/financeproject/issues/121#issuecomment-4937667477
- 작업 브랜치: `codex/121-recommend-controller`
- 기준 main: `19e44c186445ce08ca5c4ec6d9600181b794cf5d`
- 이번 변경은 PR #212 다음 단계로 query 초기화와 autorun continuation 결정만 분리합니다.

## 변경 파일

- `src/app/recommend/page.tsx`
- `src/lib/recommend/recommendPageController.ts`
- `tests/recommend-page-controller.test.ts`
- `tests/e2e/smoke.spec.ts`
- `docs/browser-storage-inventory.json`
- `work/7/11/2026-07-11-issue-121-recommend-controller-boundary.md`

## 사용 skill

- `finance-skill-routing`: 추천·플래닝 연결 변경에 필요한 저장소 skill 조합 선택
- `planning-gate-selector`: 순수 controller, App Router, E2E, 플래닝 연동 영향에 맞는 검증 세트 선택
- `playwright`: query autorun, 자동 저장, history 이동, 동일 signature 재사용의 실제 브라우저 검증
- `work-log-closeout`: 실제 변경·검증·잔여 리스크를 표준 종료 기록으로 정리
- `github:yeet`: 의도한 파일만 커밋·push하고 Issue 연결 PR을 게시하는 절차 적용

## 변경 이유

- PR #212 이후에도 추천 페이지가 저장 profile 복원, query override, autorun flag, 동일 실행 재사용, history 이동 분기를 직접 계산했습니다.
- 이 분기는 플래닝 report action 링크의 query 계약과 브라우저 storage 계약을 함께 소유하므로, UI나 effect를 확대하기 전에 부작용 없는 결정 함수로 고정할 필요가 있었습니다.
- 실제 `fetch`, local/session storage I/O, React 상태 반영, `router.push`는 페이지에 유지해 이번 변경의 영향 범위를 좁혔습니다.

## 핵심 변경

- 저장 profile을 먼저 복원하고 query override를 나중에 적용하는 초기 상태 결정을 `buildRecommendInitialProfileState`로 분리했습니다.
- `autorun`, `save`, `go`, `from` flag 해석을 `parseRecommendQueryOverrides`로 옮기고 기존 boolean 및 validation 의미를 유지했습니다.
- 동일 signature와 run ID가 있으면 재사용하고, 아니면 새로 저장하는 결정을 `resolveRecommendAutorunContinuation`으로 분리했습니다.
- history URL 생성을 `buildRecommendHistoryHref`로 고정해 신규 저장과 재사용 경로가 같은 encoding을 사용하게 했습니다.
- 추천 페이지는 651줄에서 615줄로 줄었고, `fetch`, storage 쓰기, history 저장 payload는 기존 위치와 adapter를 그대로 사용합니다.
- browser storage inventory를 실제 소유권에 맞춰 page=`localStorage`, `recommendStorageAdapter`=`sessionStorage`로 보정했습니다.

## 계약 영향

- public URL 추가·삭제·redirect: 없음
- `/recommend` query 이름·boolean 해석 및 `/recommend/history?open=...` shape: 변경 없음
- `/api/recommend` 및 `/api/sources/status` 요청·응답 shape: 변경 없음
- `recommend_profile_v1`, `recommend_last_result_v1`, `recommend_autorun_sig`, `recommend_saved_runs_v1`: key와 payload 변경 없음
- DB schema와 migration: 변경 없음
- Prisma query와 query semantics: 변경 없음
- cache/revalidation 및 `/api/sources/status`의 `cache: "no-store"` 동작: 변경 없음
- browser storage inventory의 파일별 소유권 문서만 현재 구현에 맞게 변경했습니다.

## 검증

- `corepack pnpm eslint src/app/recommend/page.tsx src/lib/recommend/recommendPageController.ts tests/recommend-page-controller.test.ts tests/e2e/smoke.spec.ts`: PASS
- `corepack pnpm vitest run tests/recommend-page-controller.test.ts tests/recommend-storage-adapter.test.ts tests/recommend-result-history.test.ts tests/recommend-results-view-model.test.tsx`: PASS, 4 files / 16 tests
- `DATABASE_URL=file:./prisma/dev.db node scripts/playwright_with_webserver_debug.mjs test tests/e2e/smoke.spec.ts --grep=recommend --workers=1`: PASS, 3 tests
- `corepack pnpm browser-storage:check`: PASS, 36 files
- `corepack pnpm lint`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS, 798 files / 2,692 tests
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, TypeScript 검사와 250 static pages 생성
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:rc`: PASS, 26 passed / production 전용 1 skipped
- `corepack pnpm planning:v2:complete`: PASS, fast E2E 8 tests 포함
- `corepack pnpm planning:v2:compat --keep-sandbox`: PASS, fixture 8 tests와 fast E2E 8 tests 포함, sandbox `/tmp/planning-v2-compat-vUTLMH`
- `corepack pnpm planning:v2:regress`: PASS, golden case 9건과 full E2E 10 tests 포함
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --check`: PASS
- 독립 reviewer: P0-P3 회귀 finding 없음. query flag, 저장 profile 우선순위, continuation/history URL, effect guard, API·storage·cache 계약이 main과 동치임을 확인했습니다.

## 회귀 방지 범위

- 저장 profile보다 query override가 우선하는 순서와 잘못된 query issue 전달을 단위 테스트로 고정합니다.
- `1`, `true`, `yes`의 대소문자 비구분 autorun/save 해석과 `go=history` 의미를 고정합니다.
- 동일 signature와 run ID를 재사용하고 run ID가 없거나 signature가 다르면 새 저장을 선택하는 규칙을 고정합니다.
- 실제 브라우저에서 autorun이 한 번 저장하고 history로 이동하며, 같은 query 재진입 시 같은 run ID와 저장 건수 1개를 유지하는지 확인합니다.
- browser storage 참조 파일과 inventory의 storage 종류가 다시 어긋나면 package gate가 실패합니다.

## 남은 리스크

- E2E의 같은 query 재진입은 전체 `page.goto` 방식입니다. 같은 컴포넌트가 유지된 채 search params만 바뀌는 effect 재실행은 직접 검증하지 않았습니다.
- 유효한 JSON이지만 잘못된 profile 값인 storage와 Storage API 자체 예외는 신규 단위 테스트에서 직접 다루지 않았습니다.
- sessionStorage의 run ID가 saved runs localStorage에서 이미 삭제된 stale 상태여도 기존처럼 재사용 결정을 합니다. 이번 PR은 기존 동작을 유지했습니다.
- 추천 페이지에는 source-status 조회 lifecycle, 저장·내보내기 command, form state가 남아 있습니다.
- Issue #121의 ProductListPage controller/view model 범위는 아직 별도 재검토가 필요하므로 Issue를 닫지 않습니다.
- 별도 `corepack pnpm typecheck`의 기존 test fixture 타입 불일치 기준선은 이번 범위에서 수정하지 않았습니다. production build TypeScript 검사는 통과했습니다.

## 롤백 기준

- 저장 profile과 query override 우선순위, autorun 1회 실행, 동일 signature 재사용 또는 history URL이 달라지면 이번 controller helper commit만 되돌립니다.
- storage key나 saved run payload 호환성 차이가 발견되면 새 contract를 추가하지 않고 페이지 내부의 이전 분기 구현으로 복원합니다.
- browser storage inventory가 실제 runtime 참조와 다시 불일치하면 문서 소유권 보정만 별도로 되돌리지 않고 코드와 함께 원인을 재확인합니다.

## 다음 라운드 우선순위

1. Issue #121의 `ProductListPage`를 현재 main에서 다시 읽고 fetch/query/filter/group/totals 중 가장 작은 pure view model 경계를 선택합니다.
2. 추천 페이지의 source-status lifecycle은 stale session run 처리와 함께 별도 작은 follow-up으로 검토합니다.
3. Issue #206은 populated DB read-only baseline과 schema/query/cache 합의가 확보되기 전에는 구현 범위를 확대하지 않습니다.
