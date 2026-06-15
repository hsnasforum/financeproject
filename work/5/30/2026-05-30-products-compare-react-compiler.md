# 2026-05-30 Products compare React Compiler 경고 축소

## 변경 파일
- `src/app/products/compare/page.tsx`

## 사용 skill
- `finance-skill-routing`: products compare page 변경에는 기본 구현/검증 skill만 필요하고 조건부 route/DART/planning-v3 batch skill은 제외해도 되는지 확인했습니다.
- `planning-gate-selector`: App Router page와 React hook 상태 흐름 변경에 필요한 최소 검증 세트를 골랐습니다.
- `work-log-closeout`: 변경 파일, 검증, 남은 리스크, 다음 라운드를 기록하는 종료 노트 형식에 맞췄습니다.

## 변경 이유
- `react-hooks/set-state-in-effect` 경고가 `/products/compare` page의 mount effect에서 `refresh()`를 즉시 호출하는 흐름에 남아 있었습니다.
- `refresh()`는 localStorage의 비교 후보 id를 읽고 `ids`, `cells`, `loading`을 갱신하므로 effect 본문에서 직접 상태 갱신 흐름을 시작하지 않도록 줄여야 했습니다.

## 핵심 변경
- mount effect가 microtask 이후 `refresh()`를 호출하도록 분리했습니다.
- cleanup guard를 두어 unmount된 뒤에는 자동 refresh가 시작되지 않도록 했습니다.
- 수동 새로고침, 비교함 비우기, 개별 후보 제거 후 refresh 흐름은 기존 동작을 유지했습니다.
- route, href, 버튼 문구, `/api/products/unified/item` query 계약, 비교함 local storage 흐름은 바꾸지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/app/products/compare/page.tsx --rule react-hooks/set-state-in-effect:warn -f json`
  - 변경 전: 경고 1건, `void refresh()` 호출부.
  - 변경 후: PASS, messages `[]`.
- `corepack pnpm exec vitest run tests/compare-store.test.ts tests/unified-item-route.test.ts tests/products-unified-route.test.ts`
  - PASS, 3 files / 11 tests.
- `mkdir -p tmp && corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-products-compare.json`
  - PASS, 남은 경고 39건 / 32파일, 현재 target 없음.
  - 다음 상위 잔여 파일: `src/app/recommend/page.tsx`, `src/components/AuditLogCard.tsx`, `src/components/AutoMergeClient.tsx`, `src/components/BenefitsClient.tsx`, `src/components/DartAlertsSummaryCard.tsx`.
- `git diff --check`
  - PASS.
- `corepack pnpm lint`
  - PASS.
- `corepack pnpm test`
  - PASS, 663 files / 2035 tests.
- `corepack pnpm build`
  - PASS.
- `find . -maxdepth 1 -type d -name '.next-build-*' -print`
  - PASS, 남은 임시 build 디렉터리 없음.
- `corepack pnpm multi-agent:guard`
  - PASS, latestWorkNote=`work/5/30/2026-05-30-products-compare-react-compiler.md`.

## 남은 리스크
- [가정] DOM 구조, route, href, selector를 바꾸지 않았으므로 `corepack pnpm e2e:rc`는 이번 라운드 기본 검증에서 제외했습니다.
- [검증 필요] products compare 전용 browser/e2e 테스트가 뚜렷하지 않아, 실제 브라우저에서 localStorage 후보가 있는 첫 진입의 로딩 표시 타이밍은 별도 UX 확인 여지가 있습니다.
- 이번 변경은 자동 mount refresh만 지연시키며, 사용자가 누르는 새로고침/삭제/비우기 동작은 기존처럼 즉시 상태 갱신을 시작합니다.

## 다음 라운드
- `react-hooks/set-state-in-effect` 잔여 상위 파일인 `src/app/recommend/page.tsx`부터 별도 manager 라운드로 조사합니다.
