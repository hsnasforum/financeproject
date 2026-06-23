# 2026-06-23 v2 profiles route service boundary

## 변경 파일
- `src/app/api/planning/profiles/route.ts`
- `src/app/api/planning/profiles/[id]/route.ts`
- `src/app/api/planning/v2/profiles/route.ts`
- `src/app/api/planning/v2/profiles/[id]/route.ts`
- `src/lib/planning/server/profiles/routeService.ts`
- `tests/planning-v2-api/profiles-route.test.ts`

## 사용 skill
- `finance-skill-routing`: 이번 라운드에 필요한 기본 skill 조합 확인.
- `planning-gate-selector`: profile API route 변경에 맞는 테스트, lint, build, v2 complete/regress 게이트 선정.
- `work-log-closeout`: `/work` 종료 기록 형식과 필수 항목 확인.

## 변경 이유
- profile API route가 repository와 audit store를 직접 import하고 있어 route handler의 책임이 인증, 입력 검증, 응답 매핑을 넘어섰습니다.
- 사용자 소유권 경계 정리 목표에 맞춰 profile 저장소 접근과 감사 로그 기록을 service 계층으로 이동했습니다.
- legacy `/api/planning/profiles*`와 v2 `/api/planning/v2/profiles*`가 같은 profile route service를 통해 current-user repository를 사용하도록 맞췄습니다.

## 핵심 변경
- `profiles/routeService.ts`를 추가해 profile CRUD, legacy meta row 조립, 기본 프로필 지정, create/update/delete audit, trash audit 기록을 담당하게 했습니다.
- v2 profile routes는 canonical profile 검증과 `jsonOk/jsonError` 매핑은 유지하고 저장소/audit 호출만 service로 위임합니다.
- legacy profile routes는 dev/local guard와 응답 shape를 유지하면서 meta 조회/생성/수정 로직을 service로 위임합니다.
- profile source-boundary 테스트를 repository 직접 import 허용에서 route service 사용 검증으로 갱신했습니다.
- 현재 스캔 기준 profile API route의 `server/profiles/repository`, `auditLogStore` 직접 import는 남아 있지 않습니다.

## 검증
- `corepack pnpm test tests/planning-v2-api/profiles-route.test.ts tests/planning-v2-api/persistence-routes.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts` PASS
- `corepack pnpm lint` PASS
- `corepack pnpm build` PASS
- `corepack pnpm planning:v2:complete` PASS
- `corepack pnpm planning:v2:regress` PASS
- `git diff --check` PASS
- `rg -n -F -e server/profiles/repository -e auditLogStore src/app/api/planning/v2/profiles src/app/api/planning/profiles` no matches

## 남은 리스크
- route가 canonical profile validation을 직접 호출하는 구조는 유지했습니다. 저장소/감사 경계 정리가 목적이라 validation service 통합은 별도 판단이 필요합니다.
- `src/app/planning/page.tsx`, `src/app/planning/runs/page.tsx`, `src/app/planning/reports/[id]/page.tsx`에는 서버 컴포넌트의 repository 직접 import가 남아 있습니다.
- GitHub Actions의 `BlobNotFound` failure 패턴은 이번 라운드에서 아직 재확인하지 않았습니다. PR 생성 후 원격 상태를 별도로 확인해야 합니다.
