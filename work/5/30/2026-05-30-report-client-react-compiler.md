# 2026-05-30 ReportClient React Compiler 경고 축소

## 변경 파일
- `src/components/ReportClient.tsx`
- `work/5/30/2026-05-30-report-client-react-compiler.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기록 기준으로 이번 라운드에 필요한 기본 skill 조합을 확인했습니다.
- `planning-gate-selector`: React hook 상태 변경과 legacy `/report` 컴포넌트 영향에 맞는 검증 범위를 정했습니다.
- `work-log-closeout`: 변경 파일, 실행한 검증, 남은 리스크를 `/work` 형식으로 기록했습니다.

## 변경 이유
- `ReportClient`가 저장된 추천 실행이 바뀔 때 `useEffect` 안에서 `setRecommendationPage(1)`을 즉시 호출해 `react-hooks/set-state-in-effect` 경고 1건을 만들었습니다.
- `/report`는 `/planning/reports`로 리다이렉트되는 legacy 경로이지만 production build에는 계속 포함되므로 컴포넌트 자체는 유지하고 경고만 최소 수정으로 제거했습니다.

## 적용 변경
- 추천 페이지 상태를 숫자 하나가 아니라 `{ runId, page }` 형태로 저장하도록 바꿨습니다.
- 현재 `savedRun?.runId`와 상태의 `runId`가 다르면 렌더 단계에서 1페이지로 해석하게 해 동기 effect reset을 제거했습니다.
- 이전/다음 버튼은 현재 실행 ID와 현재 페이지 기준으로 다음 페이지 상태를 저장하도록 바꿨습니다.
- route, href, selector, API contract, env, DART freshness, 사용자 노출 문구는 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/components/ReportClient.tsx --rule react-hooks/set-state-in-effect:warn -f json`
  - 변경 전: `setRecommendationPage(1)` 위치에서 경고 1건 확인.
  - 변경 후: PASS. `warningCount: 0`.
- `corepack pnpm exec vitest run tests/report-builder.test.ts tests/report-page-redirect.test.ts`
  - PASS. 2개 파일 / 4개 테스트 통과.
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-report-client.json`
  - PASS. 전체 잔여 경고: 10건 / 7개 파일.
  - 이번 대상 파일 `src/components/ReportClient.tsx` 경고 없음.
- `git diff --check`
  - PASS.
- `pnpm lint`
  - PASS.
- `pnpm test`
  - PASS. 663개 파일 / 2035개 테스트 통과.
- `pnpm build`
  - PASS. Next.js production build 및 `/report`, `/planning/reports` 계열 라우트 포함 확인.
- `find . -maxdepth 1 -type d \( -name '.next-build-*' -o -name '.next-e2e-*' -o -name '.next-build' \) -print`
  - 출력 없음. 잔여 isolated build/e2e 산출물 없음.

## 남은 리스크
- `ReportClient`는 legacy 리포트 컴포넌트로 보이며 텍스트 검색 기준 직접 사용처는 제한적입니다. 다만 production build에 `/report`가 포함되므로 삭제 대신 유지 보수형 수정으로 남겼습니다.
- 추천 실행이 바뀌면 페이지 상태가 삭제되는 것이 아니라 현재 실행 ID와 맞지 않아 1페이지로 해석됩니다. 동일 실행 ID로 돌아오면 이전에 저장된 페이지가 다시 쓰일 수 있습니다.
- 다음 React Compiler 경고 축소 후보는 `src/components/RulesOpsClient.tsx`입니다.

## 다음 라운드 우선순위
- `src/components/RulesOpsClient.tsx`의 `react-hooks/set-state-in-effect` 경고를 기준선으로 확인합니다.
- ops rules 화면 변경이면 관련 tests/ops 규칙 테스트와 `pnpm lint`, `pnpm test`, `pnpm build`를 최소 검증 후보로 검토합니다.
