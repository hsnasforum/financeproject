# 2026-07-11 Issue #126 리포트 hydration 회귀 방지

## 변경 파일

- `tests/e2e/flow-history-to-report.spec.ts`
- `work/7/11/2026-07-11-issue-126-report-hydration-regression.md`

## 사용 skill

- `planning-gate-selector`: planning reports 사용자 흐름의 console 회귀 테스트에 맞춰 focused Playwright, lint, test, build, RC E2E와 planning gate를 선택
- `playwright`: 추천 비교 deep-link, 보조 정보 펼침, 저장 리포트 이동 과정의 hydration console을 실제 브라우저에서 확인
- `work-log-closeout`: 재현 결과, runtime 미변경 결정, 검증과 잔여 위험을 저장소 종료 기록으로 정리

## 변경 이유

- Issue: https://github.com/hsnasforum/financeproject/issues/126
- 범위 재확인: https://github.com/hsnasforum/financeproject/issues/126#issuecomment-4942114309
- 기준 main: `917b57e5b29f888456469cb87f3e795403d15800`
- Issue에는 `/planning/reports`의 `<details open>` SSR/CSR hydration mismatch가 기록돼 있지만, 최신 main의 동일 추천 비교 deep-link 흐름에는 이를 직접 실패시키는 console 회귀 검사가 없었습니다.
- `PlanningReportsDashboardClient`의 추천 복구 정보 `<details>`는 여전히 controlled 상태지만, 최신 main에서 격리 데이터 디렉터리와 포트를 바꾼 두 번의 재현 실행 모두 hydration mismatch가 발생하지 않았습니다.
- 재현 근거 없이 runtime을 바꾸지 않고 현재 정상 상태를 E2E 계약으로 고정했습니다.

## 핵심 변경

- Playwright console에서 `A tree hydrated`, `Hydration failed`, `server rendered HTML didn't match` 메시지를 수집합니다.
- 기존 recommendation deep-link E2E가 비교 리포트 진입, 보조 정보 펼침, 저장, 상세 리포트 이동을 마친 뒤 수집 결과가 비어 있는지 검증합니다.
- console listener는 `finally`에서 제거해 이후 테스트로 누수되지 않게 했습니다.
- public component, route, query, 저장/추천 handoff와 `<details>` runtime 동작은 변경하지 않았습니다.

## 검증

- `corepack pnpm exec eslint tests/e2e/flow-history-to-report.spec.ts`: PASS
- `PLANNING_DATA_DIR=.data/planning-e2e-126-baseline-a DATABASE_URL=file:./prisma/dev.db node scripts/playwright_with_webserver_debug.mjs --port=3226 test tests/e2e/flow-history-to-report.spec.ts --grep "planning reports preserve compare and recommendation deep links" --workers=1 --reporter=line`: PASS, 1 test
- `PLANNING_DATA_DIR=.data/planning-e2e-126-baseline-b DATABASE_URL=file:./prisma/dev.db node scripts/playwright_with_webserver_debug.mjs --port=3227 test tests/e2e/flow-history-to-report.spec.ts --grep "planning reports preserve compare and recommendation deep links" --workers=1 --reporter=line`: PASS, 1 test
- `PLANNING_DATA_DIR=.data/planning-e2e-126-focused DATABASE_URL=file:./prisma/dev.db node scripts/playwright_with_webserver_debug.mjs --port=3228 test tests/e2e/flow-history-to-report.spec.ts --workers=1 --reporter=line`: PASS, 10 tests
- `corepack pnpm lint`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, TypeScript 검사와 250 static pages 생성
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:rc`: PASS, 26 passed / 1 skipped
- `corepack pnpm planning:v2:complete`: PASS, fast E2E 8 tests 포함
- `corepack pnpm planning:v2:compat --keep-sandbox`: PASS, fixture 8 tests와 fast E2E 8 tests 포함, sandbox `/tmp/planning-v2-compat-I5OCQs`
- `corepack pnpm planning:v2:regress`: PASS, golden case 9건과 full E2E 10 tests 포함
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --check`: PASS
- 독립 reviewer: actionable finding 없음. 현재 React 19 주요 경고 문구 감지와 `finally` listener cleanup을 확인

## 남은 리스크

- 최신 main에서 Issue의 기존 hydration warning을 세 번의 대상 흐름 실행과 RC E2E에서 재현하지 못했습니다. 이 변경은 재발을 감시하지만 과거 발생 원인을 새 runtime 수정으로 제거했다고 주장하지 않습니다.
- collector는 현재 React/Next가 사용하는 대표 hydration mismatch 문구 3개를 감시합니다. 프레임워크가 경고 문구를 완전히 바꾸면 감시 문자열을 갱신해야 합니다.
- 향후 경고 전달 채널이 browser console에서 `pageerror`로 바뀌거나 마지막 assertion 뒤 매우 늦게 경고가 발생하면 현재 collector가 놓칠 수 있습니다.
- 첫 번째 단일 시나리오 실행에서 정리 과정의 `GET /api/planning/v2/runs/[id]`가 `Unexpected end of JSON input`으로 500을 한 번 기록했지만 대상 UI와 hydration 검사는 통과했고, 두 번째 실행과 전체 10건 spec에서는 같은 실패가 재현되지 않았습니다.
- public URL/API/응답 shape, DB schema/migration, Prisma query semantics, cache/revalidation, browser storage 동작은 변경하지 않았습니다.
- GitHub Actions 결과는 PR 게시 후 별도로 확인하고 PR/Issue 코멘트에 기록합니다.

## 다음 라운드

1. test-only PR을 게시하고 GitHub Actions와 리뷰 상태를 확인한 뒤 Issue #126 종료 여부를 확정합니다.
2. #126이 종료되면 Issue #118은 추가 분리보다 현재 runtime/action/result presenter 경계를 수용 기준별로 먼저 audit합니다.
