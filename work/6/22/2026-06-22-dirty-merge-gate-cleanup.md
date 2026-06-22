# 2026-06-22 dirty 워크트리 병합 게이트 정리

## 변경 파일
- `src/lib/planning/v3/service/newsItemsRepository.ts`
- `tests/planning/ops/metrics-api-routes.test.ts`
- `tests/planning/ops/security-reset-route.test.ts`
- `work/6/22/2026-06-22-dirty-merge-gate-cleanup.md`

## 사용 skill
- finance-skill-routing: Finance Project 기본 작업 라우팅과 Spark 조건부 모델 지침 인지를 확인했습니다.
- planning-gate-selector: dirty/ahead 정리와 route/auth 테스트 변경에 맞춰 `sec:check`, `planning:ssot:check`, `lint`, `test`, `build`를 선택했습니다.
- route-ssot-check: route surface와 `docs/current-screens.md` 변경이 없음을 확인해 current-screens 문서 갱신은 제외했습니다.
- work-log-closeout: 변경 파일, 검증 결과, 남은 리스크를 `/work` 종료 기록으로 남겼습니다.

## 변경 이유
- 현재 브랜치는 `origin/main` 대비 ahead 상태였고, 병합 전 `planning:ssot:check`가 `src/lib/planning/**`의 직접 `Math.round` 사용 금지 규칙에서 실패했습니다.
- 전체 `pnpm test`에서는 ops summary/reset route 성공 케이스가 현재 Auth/User Scope 계약과 맞지 않아 401로 실패했습니다.
- dirty 변경을 더 쌓지 않고 main fast-forward 병합 가능한 기준선으로 정리하기 위해 최소 수정했습니다.

## 핵심 변경
- news items repository의 SQL count/total 정규화를 `asNonNegativeCount` helper로 이동해 직접 `Math.round` 호출을 제거했습니다.
- ops metrics summary 테스트 성공 요청에 trusted planning user 헤더와 `PLANNING_TRUST_AUTH_HEADERS=1` 설정을 명시했습니다.
- ops security reset 테스트 성공 요청도 같은 trusted planning user 계약으로 정렬했습니다.
- 제품 route 동작과 사용자 경로 문서는 바꾸지 않았습니다.

## 검증
- PASS: `corepack pnpm sec:check`
- PASS: `corepack pnpm planning:ssot:check`
- PASS: `corepack pnpm vitest run tests/planning/ops/metrics-api-routes.test.ts tests/planning/ops/security-reset-route.test.ts`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm test`
- PASS: `corepack pnpm build`
- PASS: `git diff --check`
- 미실행: `corepack pnpm e2e:rc`는 UI, navigation, selector, user flow 변경이 없어 실행하지 않았습니다.

## 남은 리스크
- 이번 변경은 병합 게이트 정리이며 public mutation allowlist 4건 축소는 후속 보안 라운드 범위입니다.
- trusted-header 성공 테스트는 local/internal 요청 전제입니다. production 일반 요청은 기존처럼 세션 기반 auth 또는 401 계약을 유지합니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
