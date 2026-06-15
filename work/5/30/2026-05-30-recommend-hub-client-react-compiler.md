# 2026-05-30 RecommendHubClient React Compiler 경고 축소

## 변경 파일
- `src/components/RecommendHubClient.tsx`
- `work/5/30/2026-05-30-recommend-hub-client-react-compiler.md`

## 사용 skill
- `finance-skill-routing`: 이번 라운드의 기본 구현 skill 조합과 조건부 skill 필요 여부를 확인했습니다.
- `planning-gate-selector`: React 훅 변경과 `/recommend` 화면 영향에 맞는 검증 범위를 정했습니다.
- `work-log-closeout`: 변경 파일, 실행한 검증, 남은 리스크를 `/work` 형식으로 기록했습니다.

## 변경 이유
- `RecommendHubClient`가 mount 직후 `loadData()`를 effect 본문에서 바로 호출하고, `loadData`가 첫 `await` 전에 loading/error state를 갱신해 `react-hooks/set-state-in-effect` 경고 1건을 만들었습니다.
- 추천 점수 계산, 금융상품 API 목록, 필터 UI, 결과 카드 렌더링은 유지하면서 React Compiler 경고만 줄이는 것이 목표였습니다.

## 핵심 변경
- 최초 금융상품 목록 조회를 `window.setTimeout(..., 0)`으로 다음 macrotask에 예약했습니다.
- 컴포넌트 unmount 시 예약된 최초 조회를 `window.clearTimeout`으로 정리하도록 했습니다.
- 수동 `실시간 갱신`, 탭/기관 필터, 저축/대출 조건 입력, `scoreProducts` 계산, 금융상품 API path, 사용자 문구는 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/components/RecommendHubClient.tsx --rule react-hooks/set-state-in-effect:warn -f json`
  - 변경 전: `react-hooks/set-state-in-effect` 1건. `loadData()` 초기 effect 호출 지점.
  - 변경 후: PASS. `warningCount: 0`.
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-recommend-hub-client.json`
  - PASS. 전체 잔여 경고: 11건 / 8개 파일.
  - 이번 대상 파일 `src/components/RecommendHubClient.tsx` 경고 없음.
- `corepack pnpm exec vitest run tests/recommend-score.test.ts tests/recommend-finlife-direction.test.ts tests/recommend-why-nonempty.test.ts tests/recommend-unified-vs-legacy.test.ts tests/recommend-unified-adapter.test.ts`
  - PASS. 5개 파일 / 10개 테스트 통과.
- `pnpm lint`
  - PASS.
- `pnpm test`
  - PASS. 663개 파일 / 2035개 테스트 통과.
- `git diff --check`
  - PASS.
- `pnpm build`
  - PASS. Next.js production build 및 `/recommend`, `/recommend/history`, `/api/recommend`, `/api/finlife/*` 경로 포함 확인.
- `find . -maxdepth 1 -type d \( -name '.next-build-*' -o -name '.next-e2e-*' -o -name '.next-build' \) -print`
  - 출력 없음. 잔여 isolated build/e2e 산출물 없음.

## 남은 리스크
- `/recommend` 첫 진입 시 금융상품 목록 조회 시작이 기존보다 한 macrotask 늦게 예약됩니다.
- 실제 목록 조회 성공 여부는 `/api/finlife/*` 응답, fallback/cache 상태, 외부 데이터 가용성에 의존합니다.
- route, href, selector, 사용자 문구, 추천 계산식을 바꾸지 않아 `pnpm e2e:rc`는 실행하지 않았습니다.

## 다음 라운드 우선순위
- 다음 React Compiler 경고 축소 후보는 `src/components/ReportClient.tsx`입니다.
