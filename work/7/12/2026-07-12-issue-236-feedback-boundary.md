# Issue #236 피드백 공개/관리 경계 분리

## 변경 파일

- 공개 접수/관리 계약: `src/lib/feedback/feedbackContracts.ts`, `src/lib/feedback/feedbackManagementCapability.ts`, `src/app/api/feedback/_lib/managementGuard.ts`
- API/접근 경계: `src/app/api/dev/unlock/route.ts`, `src/app/api/feedback/route.ts`, `src/app/api/feedback/list/route.ts`, `src/app/api/feedback/recent/route.ts`, `src/app/api/feedback/[id]/route.ts`, `middleware.ts`
- 저장/OPS 소유권: `src/lib/feedback/feedbackStore.ts`, `src/lib/ops/autoTicket.ts`
- 사용자 화면/route SSOT: `src/components/DashboardClient.tsx`, `src/components/FeedbackFormClient.tsx`, `src/components/FeedbackListClient.tsx`, `src/components/FeedbackDetailClient.tsx`, `src/lib/navigation/routeRegistry.ts`, `docs/current-screens.md`
- 회귀 테스트: `tests/feedback-route-guards.test.ts`, `tests/feedback-management-capability.test.ts`, `tests/feedback-store.test.ts`, `tests/dev-unlock-auth.test.ts`, `tests/middleware-security.test.ts`, `tests/navigation-route-registry.test.ts`, `tests/planning/catalog/currentScreens.opsRoutes.test.ts`, `tests/planning/catalog/currentScreens.supportRoutes.test.ts`

## 사용 skill

- `finance-skill-routing`: 이번 보안 경계 작업에 필요한 최소 skill 조합 선택
- `planning-gate-selector`: route/API/UI 변경의 최소 검증과 PR 전 검증 범위 선택
- `route-ssot-check`: 피드백 관리 화면의 Ops 재분류와 `docs/current-screens.md` 정합성 확인
- `github:github`: Issue #236, #237 및 연관 Issue 상태와 최신 코멘트 확인
- `work-log-closeout`: 변경 파일, 검증, 잔여 리스크, 후속 작업 인계 형식 정리

## 변경 이유

- 공개 `POST /api/feedback`와 피드백 목록·상세·수정 관리 기능이 같은 익명 공개 경계에 있어 저장된 진단 정보와 운영 메모가 노출될 수 있었습니다.
- same-origin 검사는 CSRF 완화일 뿐 운영자 권한이 아니므로, 관리 기능에 별도의 로컬 운영 capability를 요구하도록 분리했습니다.
- 공개 의견과 OPS 자동 티켓이 같은 저장 API를 사용하던 계약을 명시적인 `recordKind`와 입력 함수로 분리했습니다.

## 핵심 변경

- 공개 접수는 기존 URL과 성공 상태를 유지하되 응답을 정확히 `{ ok: true }`로 제한하고 저장 레코드·식별자·진단 정보를 반환하지 않습니다.
- 목록, 최근 목록, 상세, 수정 API는 development 로컬 직접 연결과 `Dev unlock`에서 발급한 목적 제한 서명 cookie를 모두 요구하며 production에서는 404를 반환합니다.
- 관리 응답은 허용 필드만 명시적으로 투영하고 `fingerprint` 및 이후 추가될 저장 필드가 자동으로 노출되지 않게 했습니다.
- 공개 의견과 OPS 티켓을 `public-feedback`/`ops-ticket`으로 구분하고, 레거시 레코드는 제한된 규칙으로 추론하되 이후 수정으로 종류가 바뀌지 않게 했습니다.
- 대시보드의 익명 최근 피드백 조회·관리 링크를 제거하고, 피드백 관리 화면을 route SSOT의 Ops/Admin 범위로 재분류했습니다.

## 검증

- `DATABASE_URL=file:./prisma/dev.db corepack pnpm exec vitest run tests/feedback-route-guards.test.ts tests/feedback-management-capability.test.ts tests/dev-unlock-auth.test.ts tests/feedback-store.test.ts tests/auto-ticket.test.ts tests/middleware-security.test.ts tests/navigation-route-registry.test.ts tests/planning/catalog/currentScreens.supportRoutes.test.ts tests/planning/catalog/currentScreens.opsRoutes.test.ts` — PASS, 9 files / 60 tests
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test` — PASS, 826 files / 2,927 tests. 병렬 test+lint 시도의 9건 timeout은 순차 재실행에서 재현되지 않았고 assertion 실패는 없었습니다.
- `corepack pnpm lint` — PASS. 병렬 실행의 도구 timeout 뒤 순차 재실행으로 종료 코드 0을 확인했습니다.
- `corepack pnpm typecheck` — PASS
- `corepack pnpm sec:scan:routes` — PASS, `devRoutes=37 opsRoutes=38 prodHiddenPages=7 publicMutationAllowlist=0 opsActions=3`
- `corepack pnpm planning:ssot:check` — PASS, 5 files / 11 tests
- `DATABASE_URL=file:./prisma/dev.db NEXT_BUILD_HEARTBEAT_MS=20000 corepack pnpm build` — PASS. 첫 실행은 5분 도구 제한으로 종료 코드를 확보하지 못했고, 제한을 늘린 단일 재실행에서 종료 코드 0을 확인했습니다.
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:rc` — PASS, 38 passed / 2 skipped
- `git diff --check` — PASS

## 남은 리스크와 엣지케이스

- 표준 `Request`만으로 직접 연결 peer IP를 검증할 수 없어, 외부에 노출된 development 서버에서 공격자가 `Host: localhost`를 위조하고 동시에 `DEV_ACTION_TOKEN`까지 보유하면 관리 capability를 발급받을 가능성이 남습니다. 전달 host는 거부하고 production은 404로 막았지만, development 서버 자체를 외부에 공개하지 않는 운영 전제가 필요합니다.
- 실제 production 관리자 계정/역할과 배포 토폴로지는 Issue #232/#233 범위입니다. 해당 경계가 확정되기 전까지 피드백 관리 화면과 API는 production 비노출입니다.
- 기존 JSON 저장소의 동시 쓰기, 손상 복구, 보존 기간, 삭제/내보내기 정책은 이번 최소 경계 수정에 포함하지 않았습니다.
- `recordKind`가 없는 레거시 항목은 P0이면서 `ops` 태그 또는 `[OPS][...]` 메시지 형식인 경우에만 OPS 티켓으로 추론합니다. 저장소가 다음에 갱신될 때 명시 필드로 유지됩니다.

## 다음 작업

- Issue #237에서 `POST /api/gov24/sync`, `POST /api/sync/smoke`와 mutation route scanner의 실행 capability를 별도 PR로 정리합니다.
- 관리자 identity/role이 확정되면 production 피드백 관리 경계를 local-only 404에서 역할 기반 권한으로 확장할지 별도 결정합니다.
