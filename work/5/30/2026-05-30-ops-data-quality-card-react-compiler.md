# 2026-05-30 OpsDataQualityCard React Compiler 경고 축소

## 변경 파일
- `src/components/OpsDataQualityCard.tsx`
- `work/5/30/2026-05-30-ops-data-quality-card-react-compiler.md`

## 사용 skill
- `finance-skill-routing`: 구현 라운드의 기본 skill 조합과 조건부 skill 필요 여부를 확인했습니다.
- `planning-gate-selector`: React 훅 컴포넌트와 ops data quality 카드 변경에 맞는 검증 범위를 정했습니다.
- `dart-data-source-hardening`: Finlife/DART 외부 데이터 품질, 신선도, CSRF 누락, API 실패/빈값 안내가 변경되지 않는지 점검했습니다.
- `work-log-closeout`: 실제 실행한 명령과 남은 리스크를 `/work` 형식에 맞춰 기록했습니다.

## 변경 이유
- `OpsDataQualityCard`가 mount 직후 `load(false)`를 effect 본문에서 바로 호출하고, `load`가 첫 `await` 전에 `setLoading`, `setError`, `setReport`를 실행해 `react-hooks/set-state-in-effect` 경고 1건을 만들었습니다.
- Finlife/DART 외부 데이터 품질 점검 결과, stale 표시, CSRF 안내, 재시도/수동 점검 흐름은 유지하면서 React Compiler 경고만 줄이는 것이 목표였습니다.

## 핵심 변경
- 최초 `/api/ops/data-quality` 조회를 `window.setTimeout(..., 0)`으로 다음 macrotask에 넘겼습니다.
- 컴포넌트 unmount 시 예약된 최초 조회를 `window.clearTimeout`으로 정리하도록 했습니다.
- 수동 `지금 점검`, `다시 시도`, `/ops/doctor` 링크 흐름은 변경하지 않았습니다.
- `checkedAt`, `overallStatus`, `summary`, `datasets`, `staleDays`, `issues` 표시와 사용자 노출 문구는 변경하지 않았습니다.
- route, href, API path, 데이터 payload 계약은 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/components/OpsDataQualityCard.tsx --rule react-hooks/set-state-in-effect:warn -f json`
  - 변경 전: `react-hooks/set-state-in-effect` 1건.
  - 변경 후 PASS. `warningCount: 0`.
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-ops-data-quality-card.json`
  - PASS. 전체 잔여 경고: 19건 / 16개 파일.
  - 이번 대상 파일 `src/components/OpsDataQualityCard.tsx` 경고 없음.
- `corepack pnpm exec vitest run tests/planning/ops/dataQuality.test.ts tests/planning/ops/dataQualityDoctorChecks.test.ts tests/dev-unlock-shortcut.test.ts tests/ops-error-contract.test.ts`
  - PASS. 4개 파일 / 16개 테스트 통과.
- `pnpm lint`
  - PASS.
- `git diff --check`
  - PASS.
- `pnpm test`
  - PASS. 663개 파일 / 2035개 테스트 통과.
- `pnpm build`
  - PASS. Next.js production build 및 `/api/ops/data-quality`, `/ops`, `/ops/doctor` 포함 확인.
- `find . -maxdepth 1 -type d \( -name '.next-build-*' -o -name '.next-e2e-*' \) -print`
  - 출력 없음. 임시 Next 산출물 누수 없음.

## 남은 리스크
- 최초 data quality 결과가 기존보다 한 macrotask 늦게 반영됩니다.
- 실제 data quality 점검 결과는 Finlife/DART 로컬 snapshot, corp index 파일, ops policy stale 기준, CSRF 상태에 의존합니다.
- 이번 변경은 route, href, selector, API 계약, 사용자 문구를 바꾸지 않아 `pnpm e2e:rc`는 실행하지 않았습니다.

## 다음 라운드 우선순위
- 다음 React Compiler 경고 축소 후보는 `src/components/OpsDoctorClient.tsx`입니다.
