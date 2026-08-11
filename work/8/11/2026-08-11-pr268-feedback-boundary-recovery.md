# 2026-08-11 PR #268 피드백 경계 최신 main 복구

## 기준

- 대상 PR: `#268` (`codex/236-feedback-boundary`)
- 원격 PR head: `a6b9d10ee4a35b84c2762e3af8dd0b210104b707`
- 재기반한 `origin/main`: `93ed9835978f8aaf7ccaaf61696b65dc6af7294e`
- 격리 worktree: `/tmp/finance-pr268-recovery-20260811`
- 기존 사용자 worktree와 미커밋 변경은 수정하거나 폐기하지 않았다.

## 변경 파일

- 피드백 경계: `middleware.ts`, `src/lib/feedback/feedbackStore.ts`, `src/lib/ops/autoTicket.ts`, `src/lib/ops/opsTicketParser.ts`, `src/components/FeedbackDetailClient.tsx`
- route/UI 분류: `src/lib/navigation/routeRegistry.ts`
- route SSOT: `docs/current-screens.md`
- 회귀 테스트: `tests/auto-ticket.test.ts`, `tests/feedback-store.test.ts`, `tests/middleware-security.test.ts`, `tests/mobile-navigation-contract.test.tsx`, `tests/navigation-route-registry.test.ts`, `tests/ops-ticket-parser.test.ts`

## 사용 skill

- `finance-skill-routing`: 이번 복구 라운드에 필요한 최소 skill 조합 선택
- `planning-gate-selector`: route/API/UI 및 보안 경계 변경의 검증 범위 선택
- `route-ssot-check`: 실제 피드백 경로, Ops 분류, 내비게이션, `docs/current-screens.md` 정합성 감사
- `github:github`: PR head/base/diff/checks와 기존 스택 관계 확인
- `github:yeet`: 기존 PR 브랜치의 의도한 변경만 커밋·push하는 게시 절차 적용
- `work-log-closeout`: 변경 파일, 실제 검증, 잔여 리스크와 다음 작업 정리

## 변경 이유

- PR #268은 최신 `main`에 아직 포함되지 않은 고유 보안 변경이므로 폐기하지 않고 최신 `main`을 병합해 재검증해야 했다.
- 정적 리뷰에서 명시적 `public-feedback`도 예전 OPS 태그·메시지 휴리스틱으로 복구 실행 UI 또는 자동 완료 대상이 될 수 있음을 확인했다.
- middleware의 일반 matcher가 prefetch 헤더가 있는 요청을 건너뛰어 production 피드백 관리 page 404가 우회될 수 있었고, development에서는 전달 host가 로컬 판정에 영향을 줄 수 있었다.
- `/feedback/list`, `/feedback/[id]`가 route policy상 Ops인데 전역 header/mobile navigation에서는 public 화면으로 남는 UI 분류 회귀가 있었다.

## 핵심 변경

- `recordKind`가 있으면 이를 OPS 판정의 권위 있는 기준으로 사용하고, 태그·메시지 휴리스틱은 `recordKind`가 없는 레거시 입력에만 유지한다.
- 자동 티켓 중복 append와 복구 완료 처리는 `ops-ticket`만 갱신하며, OPS 형태 또는 같은 fingerprint의 명시적 `public-feedback`은 변경하지 않는다.
- `addPublicFeedback()`는 공개 허용 필드만 명시적으로 복사해 더 넓은 런타임 객체의 운영 필드가 저장되지 않게 한다.
- 피드백 관리 page/API에 prefetch 예외 없는 matcher를 추가하고, 관리 하위 경로의 `x-forwarded-host` 요청을 거부한다. exact `/feedback` 및 `POST /api/feedback` 공개 경계는 유지한다.
- route visibility가 `ops`/`dev`이면 전역 운영 UI로 판정해 피드백 관리 화면에서 public mobile nav와 spacer를 제거하고 운영 strip을 표시한다.
- `docs/current-screens.md`에 exact public 피드백 접수 API와 하위 관리 API의 production 404/capability 경계를 명시했다.

## 검증

- 피드백/OPS/middleware/navigation 집중 테스트 — PASS, 6 files / 59 tests
- Next `unstable_doesMiddlewareMatch` 기반 prefetch matcher 계약 — PASS. `/feedback/list`, `/feedback/[id]`, `/api/feedback/list`, `/api/feedback/[id]`가 `next-router-prefetch`와 `purpose: prefetch` 모두에서 middleware 대상임을 확인했다.
- `DATABASE_URL=<local-dummy-postgres-url> corepack pnpm verify` — PASS, 827 files / 2,939 tests. lint, typecheck, 보안 검사와 route scanner 포함.
- 첫 `pnpm verify`는 격리 worktree에 `.env.local`이 없어 PostgreSQL readiness 테스트 4건이 `DATABASE_URL` 누락으로 실패했다. 비접속용 더미 PostgreSQL URL을 주입한 해당 파일 단독 재실행은 15/15 PASS였고, 같은 조건의 전체 재실행도 PASS였다.
- `corepack pnpm deps:audit` — PASS, 662 packages / 687 versions / advisories 0
- `corepack pnpm planning:ssot:check` — PASS, 5 files / 11 tests
- `DATABASE_URL=<local-dummy-postgres-url> corepack pnpm build` — PASS, 250 static pages 생성
- `DATABASE_URL=<local-dummy-postgres-url> corepack pnpm e2e:rc` — PASS, 38 passed / 2 skipped
- `git diff --check` — PASS

## 남은 리스크

- 표준 `Request`에서 직접 연결 peer IP를 항상 검증할 수 없으므로 development 서버를 외부에 공개하지 않는 운영 전제는 유지된다. 피드백 관리 경로는 전달 host를 거부하고 production에서는 404다.
- `recordKind`가 없는 레거시 저장 항목만 제한된 P0/OPS 휴리스틱으로 한 번 분류된다. 명시된 `recordKind`는 이후 태그·우선순위와 무관하게 우선한다.
- `analysis_docs/v1`, `analysis_docs/v2`의 일부 과거 화면 정의에는 피드백 목록·상세를 Public으로 보던 이전 정책이 남아 있다. 현행 route SSOT는 `docs/current-screens.md`이며 런타임·검증은 이 문서와 일치한다.
- 원격 GitHub Actions 결과와 최종 merge 상태는 PR #268의 checks 및 merge 기록을 기준으로 확인한다.

## 다음 작업

- PR #268의 최신 head에서 CI/E2E를 새로 통과시킨 뒤 `main`에 병합한다.
- 이어서 PR #269의 고유 커밋만 최신 `main`에 재배치하고, PR #277의 Daily Refresh pnpm cache 제거와 PR #269의 MOIS preflight/`--exchange-only` 계약을 함께 보존해 전체 검증한다.
