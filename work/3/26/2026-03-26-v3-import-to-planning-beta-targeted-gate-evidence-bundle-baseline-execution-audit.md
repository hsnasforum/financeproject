# 2026-03-26 v3 import-to-planning beta targeted-gate-evidence-bundle baseline execution audit

## 변경 파일
- `tests/e2e/v3-draft-apply.spec.ts`
- `work/3/26/2026-03-26-v3-import-to-planning-beta-targeted-gate-evidence-bundle-baseline-execution-audit.md`

## 사용 skill
- `planning-gate-selector`: 문서로 고정한 targeted beta gate / representative proof set만 실행하고 adjacent regression asset을 분리해 기록하기 위해 사용
- `route-ssot-check`: route/href/catalog 영향 여부를 확인하고 conditional gate 미실행 사유를 남기기 위해 사용
- `work-log-closeout`: 실제 PASS/FAIL, 최소 수정 범위, 미실행 검증을 `/work` 표준 형식으로 정리하기 위해 사용

## 변경 이유
- `Stream B. Contract & QA`의 targeted beta gate / evidence bundle은 문서로만 고정돼 있었고, current 저장소 기준으로 실제 같은 묶음으로 실행한 baseline 기록이 없었다.
- representative proof set 실행 중 `tests/e2e/v3-draft-apply.spec.ts`가 red로 드러나 baseline PASS/FAIL을 남기려면 first failing asset을 가장 좁게 정리할 필요가 있었다.

## 핵심 변경
- targeted beta gate `pnpm build`, `pnpm lint`, `pnpm test`를 현재 상태 기준으로 다시 실행해 PASS baseline을 확인했다.
- representative e2e proof asset `tests/e2e/v3-draft-apply.spec.ts`, `tests/e2e/planning-quickstart-preview.spec.ts`, `tests/e2e/flow-history-to-report.spec.ts`를 각각 단독 실행해 PASS baseline을 기록했다.
- first failing asset은 `tests/e2e/v3-draft-apply.spec.ts`로 고정됐고, product regression 대신 stale expectation 1건과 cold compile timeout 1건으로 좁혀졌다.
- `tests/e2e/v3-draft-apply.spec.ts`에서 load-failure fallback 링크 기대값을 현재 UI 문구인 `raw CSV Import`, `raw 배치 센터`로 맞췄다.
- 같은 스펙에서 draft apply 후 stable `/planning?profileId=...` 도착 검증 timeout을 `10_000`으로 넓혀 cold compile 변동을 흡수했다.
- `tests/e2e/planning-v2-fast.spec.ts`와 `pnpm e2e:rc`는 broader regression asset로 남겼고, 이번 targeted proof set execution audit에는 포함하지 않았다.

## 검증
- `pnpm build`
  PASS
- `pnpm lint`
  PASS, 기존 warning 24건 유지
- `pnpm test`
  PASS, `Test Files 642 passed`, `Tests 1978 passed`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/v3-draft-apply.spec.ts --workers=1`
  1차 FAIL
  - `planning v3 profile drafts list separates load failure from empty guidance`
  - 실제 UI는 `raw CSV Import`, `raw 배치 센터`를 노출하는데 e2e가 예전 링크명을 기대함
  2차 FAIL
  - `planning v3 profile draft flow can create, preflight, and apply a saved draft`
  - stable `/planning` cold compile이 5.4초 걸려 `toHaveURL` 기본 5초 timeout 초과
  3차 PASS
  - `3 passed`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/planning-quickstart-preview.spec.ts --workers=1`
  PASS, `3 passed`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-history-to-report.spec.ts --workers=1`
  PASS, `9 passed`
- `git diff --check -- tests/e2e/v3-draft-apply.spec.ts work/3/26/2026-03-26-v3-import-to-planning-beta-targeted-gate-evidence-bundle-baseline-execution-audit.md`
  PASS
- `[미실행] pnpm planning:current-screens:guard`
  - route inventory, href, catalog 영향이 없어 실행하지 않음
- `[미실행] pnpm planning:ssot:check`
  - route policy/catalog guard를 건드리지 않아 실행하지 않음
- `[미실행] pnpm e2e:rc`
  - `tests/e2e/planning-v2-fast.spec.ts`와 full suite는 adjacent broader regression asset이며 current targeted proof set 자체는 아님
- `[미실행] pnpm v3:doctor`
  - `Stream C. Ops & Readiness` 범위라 실행하지 않음
- `[미실행] pnpm v3:export`
  - `Stream C. Ops & Readiness` 범위라 실행하지 않음
- `[미실행] pnpm v3:restore`
  - `Stream C. Ops & Readiness` 범위라 실행하지 않음
- `[미실행] pnpm v3:support-bundle`
  - `Stream C. Ops & Readiness` 범위라 실행하지 않음

## 남은 리스크
- current targeted proof set은 PASS지만, `tests/e2e/v3-draft-apply.spec.ts`의 stable `/planning` 도착은 여전히 dev cold compile 시간에 민감하다.
- 이번 라운드는 targeted proof set baseline만 닫았고 `tests/e2e/planning-v2-fast.spec.ts`나 full `pnpm e2e:rc`까지 같은 층위의 release gate로 승격하지는 않았다.

## 변경 전 메모

1. 수정 대상 파일
- 우선은 없음
- 실제 failure가 나올 때만 최소 파일을 추가한다

2. 변경 이유
- targeted beta gate / evidence bundle은 문서로 잠겼지만, current baseline에서 실제로 한 번도 같은 묶음으로 실행/기록되지는 않았다.

3. 실행할 검증 명령
- `pnpm build`
- `pnpm lint`
- `pnpm test`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/v3-draft-apply.spec.ts --workers=1`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/planning-quickstart-preview.spec.ts --workers=1`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-history-to-report.spec.ts --workers=1`
