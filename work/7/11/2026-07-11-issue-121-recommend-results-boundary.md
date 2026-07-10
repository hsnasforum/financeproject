# 2026-07-11 Issue #121 추천 결과 경계 분리

## 연결 범위

- Issue: https://github.com/hsnasforum/financeproject/issues/121
- 범위 합의 코멘트: https://github.com/hsnasforum/financeproject/issues/121#issuecomment-4937236912
- 작업 브랜치: `codex/121-recommend-results-panel`
- 기준 main: `ea2d8ddadd286d06584b40ddd58593e050515cd1`
- 이번 변경은 Issue #121 전체 종료가 아니라 결과 표시 경계의 첫 follow-up입니다.

## 변경 파일

- `src/app/recommend/page.tsx`
- `src/components/recommend/RecommendResultsPanel.tsx`
- `src/lib/recommend/recommendResultsViewModel.ts`
- `tests/recommend-results-view-model.test.tsx`
- `tests/e2e/smoke.spec.ts`
- `tests/e2e/helpers/e2eTest.ts`
- `work/7/11/2026-07-11-issue-121-recommend-results-boundary.md`

## 사용 skill

- `finance-skill-routing`: 추천·플래닝 연결 화면 변경에 필요한 저장소 skill 조합 선택
- `planning-gate-selector`: UI, 순수 로직, E2E, 플래닝 연동 영향에 맞는 검증 세트 선택
- `playwright`: 추천 제출부터 비교·저장·상세 닫기까지 실제 브라우저 회귀 확인
- `work-log-closeout`: 실제 변경·검증·잔여 리스크를 표준 종료 기록으로 정리
- `github:yeet`: 의도한 파일만 커밋·push하고 Issue 연결 PR을 게시하는 절차 적용

## 변경 이유

- 기존 `src/app/recommend/page.tsx`는 query 해석, 자동 실행, local/session storage, API 요청, 데이터 출처 상태 조회, 결과 변환, 카드 표시, 저장·내보내기, 상세 drawer를 한 파일에서 함께 소유했습니다.
- 결과 화면의 표시 규칙을 수정할 때 요청·저장·히스토리 제어 흐름까지 함께 건드릴 위험이 있어, 독립 테스트가 가능한 결과 표시 경계부터 작은 단위로 분리했습니다.
- `/api/recommend`, 기존 query와 storage key, 자동 실행·히스토리 동작은 이번 단계에서 변경하지 않았습니다.

## 핵심 변경

- 추천 페이지를 1,441줄에서 651줄로 줄이고, 결과 헤더·플래닝 연동 strip·상품 카드·신뢰도 표시·상세 drawer를 `RecommendResultsPanel`로 옮겼습니다.
- unified ID 보정, 플래닝 문맥, freshness, 신뢰도 cue, 상세 상품 변환을 부작용 없는 `recommendResultsViewModel` 함수로 분리했습니다.
- 상세 drawer 상태는 부모에 유지해 새 제출 시 기존처럼 열린 상세가 닫히도록 했습니다.
- 결과 패널 단위 테스트 5건과 제출·비교 담기·결과 저장·상세 열기/닫기 E2E를 추가했습니다.
- 추천 화면에서 개발 HMR WebSocket mock이 React 상호작용을 막지 않도록 기존 E2E helper의 HMR 예외 경로에 `/recommend`를 추가했습니다.

## 계약 영향

- public URL 추가·삭제·redirect: 없음
- `/api/recommend` 및 `/api/sources/status` 요청·응답 shape: 변경 없음
- recommend query, autorun, history handoff: 변경 없음
- local/session storage key와 저장 payload shape: 변경 없음
- DB schema와 migration: 변경 없음
- Prisma query와 query semantics: 변경 없음
- cache/revalidation 및 `/api/sources/status`의 `cache: "no-store"` 동작: 변경 없음

## 검증

- `corepack pnpm eslint src/app/recommend/page.tsx src/components/recommend/RecommendResultsPanel.tsx src/lib/recommend/recommendResultsViewModel.ts tests/recommend-results-view-model.test.tsx tests/e2e/smoke.spec.ts tests/e2e/helpers/e2eTest.ts`: PASS
- `corepack pnpm vitest run tests/recommend-results-view-model.test.tsx tests/recommend-storage-adapter.test.ts tests/recommend-result-history.test.ts tests/recommend-unified-adapter.test.ts`: PASS, 4 files / 14 tests
- `DATABASE_URL=file:./prisma/dev.db node scripts/playwright_with_webserver_debug.mjs test tests/e2e/smoke.spec.ts --grep=recommend --workers=1`: PASS, 2 tests
- `corepack pnpm lint`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS, 797 files / 2,687 tests
- 전체 테스트 첫 실행은 변경과 무관한 `planning-v2-static-guard.test.ts` 1건이 5초 제한을 0.5초 넘겨 실패했고, 단독 재실행 2/2 및 전체 재실행 2,687/2,687로 통과했습니다.
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, TypeScript 검사와 250 static pages 생성
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:rc`: PASS, 25 passed / production 전용 1 skipped
- `corepack pnpm planning:v2:complete`: PASS, fast E2E 8 tests 포함
- `corepack pnpm planning:v2:compat --keep-sandbox`: PASS, fixture 8 tests와 fast E2E 8 tests 포함, sandbox `/tmp/planning-v2-compat-oS6xzz`
- `corepack pnpm planning:v2:regress`: PASS, golden case 9건과 full E2E 10 tests 포함
- `corepack pnpm typecheck`: FAIL, 변경하지 않은 test fixture 10개 파일의 기존 타입 불일치 17건. 변경 파일 오류는 없고 production build TypeScript 검사는 통과했습니다.
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --check`: PASS
- 독립 reviewer: 기능 회귀 finding 없음. query/autorun/history와 상세 reset의 직접 회귀 테스트 부족을 낮은 잔여 리스크로 분류했습니다.

## 회귀 방지 범위

- 추천 API 응답의 `unifiedId`를 `sourceId:finPrdtCd`로 보정하면서 원본 객체를 변경하지 않는 계약을 고정합니다.
- 플래닝 report action과 linkage가 결과 strip 문구·단계·실행 상태로 연결되는 계약을 고정합니다.
- freshness, fallback, 가정, 예금자 보호 및 금리 신뢰도 cue가 함께 표시되는 규칙을 고정합니다.
- 상세 상품 option에서 실제 추천 기간·금리를 우선하고 상세 payload가 없을 때 fallback shape를 유지하는 규칙을 고정합니다.
- 실제 브라우저에서 제출 후 비교 담기, 결과 저장, 상세 drawer 열기·닫기가 계속 동작하는지 확인합니다.

## 남은 리스크

- query override, autorun, autosave, history redirect는 기존 컨트롤러 경로를 그대로 유지했지만 이번 E2E에 새 시나리오를 추가하지 않았습니다.
- 새 제출 시 열려 있던 drawer를 닫는 상태 reset은 코드와 부모 상태 소유권을 유지했지만 직접 E2E assertion은 없습니다.
- 페이지 컨트롤러에는 초기 상태 복원, 자동 실행, 저장, source-status 조회가 남아 있습니다. 다음 PR에서 한 흐름씩 분리하는 편이 안전합니다.
- `corepack pnpm typecheck`의 변경 외 test fixture 오류 17건은 이번 Issue 범위를 벗어나며 별도 기준선 정리가 필요합니다.
- Issue #121은 이번 PR로 닫지 않고 다음 controller/storage orchestration follow-up에 계속 연결합니다.

## 롤백 기준

- 추천 제출 후 결과가 표시되지 않거나 비교 담기·저장·내보내기·상세 drawer 계약이 달라지면 이번 결과 경계 commit만 되돌립니다.
- `/api/recommend` 또는 storage payload 호환성 차이가 발견되면 새 public contract를 추가하지 않고 기존 페이지 구현으로 롤백합니다.
- source-status 실패가 결과 본문을 막는 회귀가 확인되면 패널 분리는 유지하지 않고 이전 비차단 표시 경계로 되돌립니다.

## 다음 라운드 우선순위

1. Issue #121에서 query 초기화와 autorun/history orchestration을 독립 테스트 가능한 controller hook 또는 helper로 가장 작게 분리합니다.
2. Issue #121의 source-status 조회 lifecycle과 저장·내보내기 command를 현재 public/storage 계약을 유지한 채 별도 검토합니다.
3. Issue #206은 populated DB read-only baseline과 schema/query/cache 합의가 확보되기 전에는 구현 범위를 확대하지 않습니다.
