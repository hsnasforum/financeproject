# 2026-06-22 assumptions overrides ownership boundary

## 변경 파일
- `src/lib/planning/server/assumptions/overridesRouteService.ts`
- `src/app/api/ops/assumptions/overrides/route.ts`
- `src/app/api/ops/assumptions/overrides/reset/route.ts`
- `tests/planning-v2-api/assumptions-overrides-route.test.ts`
- `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`

## 사용 skill
- `finance-skill-routing`: 이번 Repository/Data Ownership 라운드에 필요한 기본 skill 조합을 고르는 데 사용했습니다.
- `planning-gate-selector`: route/service 변경에 맞는 테스트, lint, build 검증 범위를 고르는 데 사용했습니다.
- `work-log-closeout`: 종료 기록 형식과 필수 항목 확인에 사용했습니다.

## 변경 이유
- `/api/ops/assumptions/overrides*` route가 target profile 해석과 overrides storage 호출을 직접 맡고 있어 route/service ownership 경계가 약했습니다.
- route handler는 auth, guard, body parse, response mapping만 담당하도록 줄이고, 사용자 소유 planning 데이터 접근은 서버 서비스 경계로 이동했습니다.

## 핵심 변경
- `overridesRouteService`를 추가해 profileId 정규화, 기본 profile 해석, overrides load/save/patch/reset을 담당하게 했습니다.
- `overrides`와 `overrides/reset` route에서 `getDefaultProfileId`, `sanitizeRecordId`, `overridesStorage` 직접 import를 제거했습니다.
- assumptions overrides route contract test에 route가 service만 사용하고 storage/path primitive를 직접 호출하지 않는 정적 계약을 추가했습니다.
- planning route coverage에 direct store/storage/database import 금지와 current-user repository named import 계약을 추가했습니다.
- ops user-owned route inventory에 assumptions overrides route service marker를 추가했습니다.

## 검증
- FAIL `corepack pnpm test tests/planning/auth/planningRouteUserScopeCoverage.test.ts` via PowerShell/Windows corepack: UNC cwd가 `C:\Windows`로 떨어진 실행 환경 문제였습니다.
- PASS `corepack pnpm test tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- PASS `corepack pnpm test tests/planning-v2-api/assumptions-overrides-route.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts tests/planning-assumptions/overridesStorage.test.ts`
- PASS `corepack pnpm planning:auth:check`
- PASS `corepack pnpm lint`
- FAIL `corepack pnpm build`: 남은 옛 타입 캐스트 `ResetBody`를 발견해 수정했습니다.
- FAIL `corepack pnpm build`: `AssumptionsOverridesMutationInput`에 `csrf` 필드가 없어 `requireCsrf` 타입과 맞지 않아 수정했습니다.
- PASS `corepack pnpm build`

## 남은 리스크
- `ops/doctor`, `ops/runs`, `ops/planning-cache/*`에는 운영자용 direct repository/namespace import가 남아 있습니다.
- `src/app/api/planning/v3/news/items/route.ts`의 direct DB query 분리는 이번 라운드 범위 밖입니다.
- 사용자 흐름이나 셀렉터 변경은 없어 e2e는 실행하지 않았습니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
