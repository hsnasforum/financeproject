# Issue #248 route registry fail-closed 작업 종료 기록

## 기준

- Issue: `#248 [Route Architecture] route registry의 unknown fail-open과 segment 없는 prefix matching 제거`
- Base: `origin/main` `5c831932634556cc3b807ca69e4e8bb31b626e6d`
- Branch: `codex/248-route-registry-fail-closed`
- 작업 범위는 UI/IA route classification과 navigation active-state 계약이다. 인증·인가 또는 middleware 접근제어로 사용하지 않는다.

## 사용 skill

- `finance-skill-routing`: 저장소 로컬 skill 중 필요한 최소 집합 선택
- `route-ssot-check`: `docs/current-screens.md`, 실제 page route, redirect alias 정합성 확인
- `planning-gate-selector`: route 변경에 필요한 focused/full/build/RC gate 선택
- `playwright`: RC 사용자 흐름 검증
- `work-log-closeout`: 변경·검증·잔여 위험 인계 형식 정리

## 변경 파일과 책임

- `src/lib/navigation/routeRegistry.ts`
  - 95개 현재 page를 `page` 또는 `redirect`로 명시 분류한다.
  - Public Stable, Public Beta, Internal, Legacy, Ops, Dev를 구분한다.
  - 등록되지 않은 pathname은 `internal/unknown`으로 fail closed한다.
  - navigation prefix는 segment 경계에서만 일치하고 exclude가 include보다 우선한다.
- `src/lib/planning/legacyPlannerRedirect.ts`
  - `/planner/[...slug]`는 등록된 planning page 또는 redirect만 보존한다.
  - 등록된 redirect는 canonical page로 보내고 unknown은 `/planning`으로 fallback한다.
- `tests/navigation-route-registry.test.ts`
  - segment false positive, dynamic pattern 깊이, static 우선, unknown 분류를 검증한다.
- `tests/planner-page-redirect.test.ts`
  - 등록 page, canonical redirect, 미등록 deep link fallback을 검증한다.
- `tests/products-category-redirect.test.ts`
  - deposit/saving query preset과 compare alias가 registry canonical destination과 일치하는지 검증한다.
- `tests/planning/catalog/currentScreens.fullRouteSet.test.ts`
  - 모든 page가 정확히 한 번 분류되고 redirect 목적지가 명시 page이며 visibility 전이가 허용되는지 공식 gate에서 확인한다.
- `docs/current-screens.md`
  - route policy SSOT, beta/internal 경계, redirect alias 규칙을 현재 구현과 맞춘다.

## 계약 영향

- Public URL 추가·삭제: 없음
- HTTP status/response shape: 없음
- Stored data/archive format: 없음
- DB query semantics: 없음
- Cache/revalidation: 없음
- Migration: 없음
- UI/IA 의미: unknown은 더 이상 Public Stable로 간주하지 않으며 navigation prefix false positive를 제거한다.

## 실행한 검증

- `pnpm test tests/navigation-route-registry.test.ts tests/planner-page-redirect.test.ts tests/products-category-redirect.test.ts tests/planning/catalog/currentScreens.fullRouteSet.test.ts tests/planning/catalog/currentScreens.experimentalRoutes.test.ts`
  - PASS: 5 files, 22 tests
- `pnpm planning:current-screens:guard`
  - PASS: 5 files, 11 tests
- `pnpm planning:ssot:check`
  - PASS: SSOT script + 5 files, 11 tests
- `pnpm typecheck`
  - PASS
- `pnpm lint`
  - PASS
- `DATABASE_URL=file:./prisma/dev.db pnpm test`
  - PASS: 804 files, 2,719 tests
- `DATABASE_URL=file:./prisma/dev.db pnpm build`
  - PASS: compile, typecheck, 250 pages
- `DATABASE_URL=file:./prisma/dev.db pnpm e2e:rc`
  - PASS: 26 passed, production-only conditional case 1 skipped
- `pnpm multi-agent:guard`
  - PASS
- `git diff --check`
  - PASS
- 최종 읽기 전용 reviewer
  - P0/P1 잔여 finding 없음

## 실패 재현과 원인 분류

- production build 직후 전체 test를 다시 실행하면 `tests/desktop-artifact-provenance.test.ts` 2개가 실패했다.
- 재현된 직접 원인은 `.next/standalone/node_modules/.pnpm/@img+sharp-linux-x64...` 아래 Next build 생성 symlink를 desktop artifact checksum guard가 거부한 것이다.
- `.next` build 산출물을 임시로 안전하게 보관한 clean test 상태에서는 전체 804 files/2,719 tests가 통과했고 종료 시 build 산출물을 복원했다.
- route 변경과 무관한 기존 test/build 실행 순서 의존으로 분류한다. 이 Issue에서 desktop packaging 코드는 수정하지 않았다.

## 남은 위험

- route policy는 UI/IA 분류용이며 접근제어 대체물이 아니다. middleware/auth가 필요하면 별도 보안 계약이 필요하다.
- 새 page 추가 시 registry와 문서를 함께 갱신하지 않으면 current-screens/SSOT gate가 실패한다.
- `/planner/[...slug]`는 명시 등록된 internal planning page도 기존 호환을 위해 보존한다. legacy alias 폐기는 telemetry와 별도 제품 결정이 필요하다.
- production build 이후 desktop artifact provenance test 실행 순서 문제는 별도 범위에서 재확인이 필요하다.

## 롤백 기준

- navigation active-state 회귀가 있으면 segment matcher commit만 되돌린다.
- 정상 public/beta/legacy route 누락 또는 잘못된 canonical destination이 있으면 classification commit을 되돌리기보다 누락 policy를 수정한다.
- unknown을 Public Stable fail-open으로 되돌리지 않는다.
- server/client bundle, public URL, HTTP shape, stored data 변경은 이번 작업에 없으므로 해당 영역 변화가 관찰되면 즉시 이 PR을 rollback한다.
