# 2026-07-01 navigation route registry 정리

## 대상 Issue
- GitHub Issue: #123 `[Medium] Header, MobileBottomNav, docs route policy가 별도 hardcoded source라 IA drift 위험`

## 사용 skill
- `planning-gate-selector`: navigation/docs route 변경에 필요한 검증 범위 선정
- `route-ssot-check`: `docs/current-screens.md`와 route SSOT guard 확인
- `work-log-closeout`: 변경 종료 기록 작성

## 수정 대상 파일
- `src/lib/navigation/routeRegistry.ts`
- `src/components/SiteHeader.tsx`
- `src/components/ui/MobileBottomNav.tsx`
- `src/components/home/ServiceLinks.tsx`
- `docs/current-screens.md`
- `scripts/planning_v2_static_guard.mjs`
- `tests/navigation-route-registry.test.ts`

## 변경 이유
- Header, MobileBottomNav, ServiceLinks가 각각 hardcoded route 배열을 갖고 있어 public IA와 docs route policy가 drift될 수 있었다.
- Ops/Dev/Debug route와 Planning v3 official beta/internal route를 같은 기준에서 분류할 수 있는 작은 registry가 필요했다.
- legacy `/planner`는 사용자 노출 링크가 아니라 route policy/redirect 판단 대상으로만 유지되어야 했다.

## 구현 요약
- `routeRegistry.ts`에 public stable, public beta, legacy, ops, dev, internal visibility를 포함한 navigation registry를 추가했다.
- Header, MobileBottomNav, ServiceLinks가 같은 registry getter를 소비하도록 바꿨다.
- Planning v3 official beta entry 4개와 internal v3 prefix를 visibility test로 구분했다.
- Ops/Dev/Debug 경로가 public nav source에 들어가지 않도록 테스트를 추가했다.
- `planning_v2_static_guard`의 legacy `/planner` 허용 범위에 route policy registry를 추가했다.

## 확인 명령과 결과
- `pnpm vitest run tests/navigation-route-registry.test.ts tests/planning/catalog/planningRoutePolicy.test.ts`: PASS, 2 files / 12 tests
- `pnpm vitest run tests/planning-v2-static-guard.test.ts tests/navigation-route-registry.test.ts`: PASS, 2 files / 7 tests
- `rg -n -e publicNavItems -e navItems -e ServiceLinks -e QuickTiles -e includePrefixes src docs tests`: PASS, 남은 hit는 registry, consumer의 getter 결과 변수, docs/test 참조로 확인
- `pnpm planning:current-screens:guard`: PASS, 5 files / 9 tests
- `pnpm planning:ssot:check`: PASS, `[planning:ssot:check] PASS`, 5 files / 9 tests
- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS, 751 files / 2486 tests
- `pnpm build`: PASS
- `pnpm e2e:rc` with clean `PLANNING_DATA_DIR=.data/planning-e2e-123-full`, `PORT=3133`: PASS, 24 passed / 1 skipped
- `git diff --check`: PASS

## 실패/재시도 기록
- `pnpm test` 1차 실행은 `src/lib/navigation/routeRegistry.ts`의 legacy `/planner` 문자열이 `planning_v2_static_guard`에 걸려 실패했다. route policy registry는 legacy visibility 판정 원천이므로 guard allowlist에 registry 파일을 추가하고 재실행해 통과했다.
- `pnpm build` 1차 실행은 304초 제한에서 출력 캡처 없이 timeout됐다. 남은 build process가 종료된 것을 확인한 뒤 600초 제한으로 재실행해 PASS를 캡처했다.
- PowerShell에서 `|`, `&&`가 shell 구문으로 해석되어 일부 검색/읽기 명령이 실패했다. `rg -e` 패턴과 병렬 단일 명령으로 바꿔 재실행했다.

## 남은 리스크와 엣지케이스
- `QuickTiles`는 이번 수용 기준의 hardcoded nav source 제거 대상에는 포함하지 않았다. 홈 tile 정책까지 완전 통합하려면 별도 작은 registry consumer 전환이 필요하다.
- `resolveRouteVisibility`는 public nav 노출 여부 판정에 초점을 둔다. header active state는 `/planning/v3/*`에서도 기존처럼 `/planning`을 active로 볼 수 있다.
- legacy route/API 삭제 여부는 telemetry/access log와 사용처 확인 전까지 확정하지 않는다.

## 롤백 기준
- public nav에서 Ops/Dev/Debug 항목이 노출되거나 MobileBottomNav가 public route에서 사라지면 이번 registry consumer 전환을 되돌린다.
- Planning v3 official beta entry가 internal로 분류되거나 internal v3 deep-link가 public nav source에 들어가면 registry 순서와 visibility rule을 되돌린다.

## 다음 라운드 우선순위
- #124 Product catalog/category/samplebank 노출 정책 정리
