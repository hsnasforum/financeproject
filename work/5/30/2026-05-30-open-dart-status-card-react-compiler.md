# 2026-05-30 OpenDartStatusCard React Compiler 경고 축소

## 변경 파일
- `src/components/OpenDartStatusCard.tsx`
- `work/5/30/2026-05-30-open-dart-status-card-react-compiler.md`

## 사용 skill
- `finance-skill-routing`: 구현 라운드의 기본 skill 조합과 DART/data-source 조건부 skill 필요 여부를 확인했습니다.
- `planning-gate-selector`: React 훅 컴포넌트와 DART 상태 UI 변경에 맞는 검증 범위를 정했습니다.
- `dart-data-source-hardening`: DART corpcodes status/build 흐름의 실패, 빈값, 기준 시점, fallback 문구가 바뀌지 않는지 점검했습니다.
- `work-log-closeout`: 실제 실행한 명령과 남은 리스크를 `/work` 형식에 맞춰 기록했습니다.

## 변경 이유
- `OpenDartStatusCard`가 mount 직후 `fetchStatus()`를 effect 본문에서 바로 호출하고, `fetchStatus()`가 첫 `await` 전에 `setLoading`, `setError`를 실행해 `react-hooks/set-state-in-effect` 경고 1건을 만들었습니다.
- DART corpcodes 인덱스 상태, 생성 시점, 자동 생성 가능 여부, 제한 상태 안내 문구는 유지하면서 React Compiler 경고만 줄이는 것이 목표였습니다.

## 핵심 변경
- 최초 `/api/public/disclosure/corpcodes/status` 조회를 `window.setTimeout(..., 0)`으로 다음 macrotask에 넘겼습니다.
- 컴포넌트 unmount 시 예약된 최초 조회를 `window.clearTimeout`으로 정리하도록 했습니다.
- 수동 상태 새로고침, 개발 환경 build 실행, build 후 status 재조회 흐름은 변경하지 않았습니다.
- `exists`, `meta.generatedAt`, `meta.count`, `message`, `canAutoBuild`, `buildEndpoint` 계약과 사용자 노출 문구는 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/components/OpenDartStatusCard.tsx --rule react-hooks/set-state-in-effect:warn -f json`
  - 변경 전: `react-hooks/set-state-in-effect` 1건.
  - 변경 후: `warningCount: 0`.
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-open-dart-status-card.json`
  - PASS. 전체 잔여 경고: 24건 / 19개 파일.
  - 이번 대상 파일 `src/components/OpenDartStatusCard.tsx` 경고 없음.
- `corepack pnpm exec vitest run tests/dart-corpcodes-search.test.ts tests/dart-corpcodes-build-auth.test.ts tests/dart-query-helpers.test.ts tests/dart-list-policy.test.ts tests/dart-base-url-env.test.ts`
  - PASS. 5개 파일 / 14개 테스트 통과.
- `pnpm lint`
  - PASS.
- `git diff --check`
  - PASS.
- `pnpm test`
  - PASS. 663개 파일 / 2035개 테스트 통과.
- `pnpm build`
  - PASS. Next.js production build 및 `/settings/data-sources`, `/api/public/disclosure/corpcodes/status`, `/api/public/disclosure/corpcodes/build` 포함 확인.
- `pnpm e2e:rc:dart`
  - PASS. 3개 DART e2e 흐름 통과.
- `pnpm cleanup:next-artifacts`
  - PASS. e2e가 남긴 `.next-e2e-3126` 제거.
- `find . -maxdepth 1 -type d \( -name '.next-build-*' -o -name '.next-e2e-*' \) -print`
  - cleanup 후 출력 없음. 임시 Next 산출물 누수 없음.
- `rg -n -e corpcodes -e OpenDartStatusCard -e disclosure/corpcodes src tests`
  - 영향 경로와 관련 DART corpcodes 테스트/e2e 위치를 확인했습니다.

## 남은 리스크
- 최초 DART corpcodes 상태 조회 결과가 기존보다 한 macrotask 늦게 반영됩니다.
- 실제 자동 인덱스 build 가능 여부는 dev 환경, 데이터 파일, upstream DART 설정 상태에 의존합니다.
- 이번 변경은 route, href, selector, API 계약, freshness 문구를 바꾸지 않았습니다.

## 다음 라운드 우선순위
- 다음 React Compiler 경고 축소 후보는 `src/components/OpsAssumptionsClient.tsx`입니다.
