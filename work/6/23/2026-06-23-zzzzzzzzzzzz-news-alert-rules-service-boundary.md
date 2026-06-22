# 2026-06-23 news alert rules service boundary

## 변경 파일
- `src/app/api/planning/v3/news/alerts/rules/route.ts`
- `src/lib/planning/v3/service/newsAlertRulesRepository.ts`
- `tests/planning-v3-news-api.test.ts`
- `work/6/23/2026-06-23-zzzzzzzzzzzz-news-alert-rules-service-boundary.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work`와 이번 구현/검증 라운드에 필요한 기본 skill 조합 확인.
- `planning-gate-selector`: App Router API route와 service boundary 변경에 맞는 테스트/build 범위 선정.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 남은 리스크를 `/work` 형식으로 정리.
- `gpt-5.3-codex-spark + xhigh`: Planning API route의 직접 파일 저장소 접근 후보를 정적 조사.

## 변경 이유
- [사실] `news/alerts/rules` route는 인증, 입력 검증, 응답 매핑 외에도 alert rules 저장소 함수 조합을 직접 알고 있었습니다.
- [해석] `newsItemsRepository` 같은 v3 service boundary 패턴과 맞추면 route handler의 책임이 줄고, current-user namespace 저장소 접근을 route 밖으로 더 좁힐 수 있습니다.
- [권고] 사용자 노출 계약은 유지하고, 저장소 읽기/쓰기/유효 규칙 조합만 `planning/v3/service` 계층으로 이동했습니다.

## 핵심 변경
- `readCurrentUserAlertRules`와 `writeCurrentUserAlertRuleOverrides` service boundary를 추가했습니다.
- `news/alerts/rules` route는 guard/auth/입력 검증/응답 whitelist만 담당하도록 import를 교체했습니다.
- `planning-v3-news-api`에 route가 `newsAlertRulesRepository`를 통하도록 정적 회귀 테스트를 추가했습니다.
- manager/Spark 조사 결과, 다음 PR 후보는 v2 markdown download pair 또는 v2 cache route service boundary로 분리했습니다.

## 검증
- `git diff --check` PASS.
- `corepack pnpm test tests/planning-v3-news-api.test.ts` PASS: 1 file, 15 tests.
- `corepack pnpm test tests/planning-v3-news-api.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts` PASS: 2 files, 48 tests.
- `corepack pnpm build` PASS.
- `corepack pnpm multi-agent:guard` PASS.

## 남은 리스크
- [리스크] 이번 PR은 alert rules route의 저장소 조합 경계만 줄였고, v2 download/cache route의 직접 storage/repository import는 후속 라운드로 남았습니다.
- [리스크] `newsAlertRulesRepository`는 기존 저장소 함수를 감싸는 얇은 boundary라 런타임 동작은 유지하지만, 더 강한 정책으로 가려면 route별 repository import 허용 목록을 별도 가드로 넓혀야 합니다.
- [리스크] `pnpm verify`와 `pnpm release:verify`는 이번 좁은 API route/service 변경에서는 실행하지 않았습니다.

## 다음 라운드 우선순위
1. `src/app/api/planning/v2/reports/[id]/download/route.ts`와 `src/app/api/planning/v2/share-report/[id]/download/route.ts`의 current-user markdown artifact read를 server service boundary로 이동합니다.
2. `src/app/api/planning/v2/{simulate,actions,scenarios,monte-carlo}/route.ts`의 cache storage 직접 호출을 route cache service로 이동합니다.
3. `src/app/api/planning/v2/runs/route.ts`의 assumptions overrides storage 직접 호출을 기존 route service 계층으로 위임합니다.
