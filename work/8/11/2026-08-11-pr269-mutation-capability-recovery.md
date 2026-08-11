# 2026-08-11 PR #269 mutation capability 최신 main 복구

## 기준

- 대상 PR: `#269` (`codex/237-mutation-capability`)
- 기존 원격 head: `0324acd3ace81a513f9c68fbdaf4a2f77ed072b1`
- 재생 기준 `origin/main`: `25500aebbf27a51d279bddf1f53d04618b052b16`
- 재생한 고유 커밋: `2d38c61d4795626df3d15b862c5d98900fd02cb9`, `0324acd3ace81a513f9c68fbdaf4a2f77ed072b1`
- 격리 worktree: `/tmp/finance-pr269-recovery-20260811`
- 기존 `/home/xpdlqj/code/finance-237-mutation-capability` worktree는 수정하거나 폐기하지 않았다.

## 변경 파일

- mutation capability registry/scanner: `scripts/security_route_registry.mjs`, `scripts/security_route_guard_scan.mjs`
- Gov24 HTTP tombstone와 freshness: `src/app/api/gov24/**`, `src/app/api/sync/smoke/route.ts`, `src/lib/publicApis/benefitsSnapshot.ts`, `src/lib/publicApis/benefitsFlowContract.ts`
- Daily Refresh: `.github/workflows/daily-refresh.yml`, `scripts/daily_refresh.mjs`, `scripts/daily_refresh_contract.mjs`, `scripts/warm_if_stale.mjs`
- Ops 실행 경계: `src/lib/dev/fixCatalog.ts`, `src/lib/dev/runScript.ts`, `src/lib/ops/actions/**`, `src/lib/ops/opsTicketParser.ts`
- UI/문서/테스트: `src/components/**`, `docs/**`, `tests/**`

## 사용 skill

- `finance-skill-routing`: 이번 복구 라운드에 필요한 최소 skill 조합 선택
- `planning-gate-selector`: route/API/UI와 scheduler 변경의 검증 범위 선택
- `dart-data-source-hardening`: Gov24·공공데이터 env, freshness, fallback, 부분 실패 경계 점검
- `route-ssot-check`: 피드백 경계와 Gov24/sync tombstone의 route SSOT 결합 확인
- `github:github`: PR head/base/diff/checks와 스택 관계 확인
- `github:yeet`: 기존 원격 브랜치의 안전한 재작성과 게시 절차 적용
- `work-log-closeout`: 변경 파일, 실제 검증, 잔여 리스크와 다음 작업 정리

## 변경 이유

- PR #269의 고유 보안 변경은 최신 `main`에 아직 포함되지 않아 PR #268 병합 뒤 새 격리 worktree에 두 커밋만 재생해야 했다.
- mutation route 126개를 단일 registry로 분류하고, HTTP에서 실행하면 안 되는 Gov24/sync job은 명시적 tombstone으로 닫아야 한다.
- PR #277의 setup-node pnpm cache 제거와 PR #269의 MOIS scheduler preflight 및 `--exchange-only` 계약을 함께 보존해야 한다.

## 핵심 변경

- mutation method 126개를 risk/capability profile로 분류하고 scanner가 누락·중복·provider drift를 fail closed한다.
- scanner는 필수 guard의 전체 분기 지배, side effect 선행 여부, result/throw/wrapper 차단 경계, lexical shadow, alias/re-export, JavaScript 인자 평가 순서를 검증한다.
- disabled tombstone은 `NODE_ENV`별 403/404 응답과 실제 `next/server#NextResponse` binding을 함께 확인한다.
- `/api/gov24/sync`, `/api/sync/smoke`는 development/test 403, production 404로 HTTP 실행을 막고 CLI/scheduler 경계만 안내한다.
- Gov24 CLI는 `.env.local` → `env.local` → `.env` 순서로 누락값만 읽고 기존 shell env를 우선하며, 의존 모듈 import 전에 env를 준비한다.
- Gov24 `scan=all`은 snapshot 교체와 무관한 결과 cache를 우회하고, shared status/UI는 stale snapshot 상태를 재렌더 뒤에도 보존한다.
- Daily Refresh는 MOIS key/HTTPS URL을 preflight하고, canonical public-source 단계 뒤 `warm:if-stale -- --exchange-only`로 중복 실행을 피한다.
- `DAILY_REFRESH`와 제거된 운영 명령은 fix allowlist/실행 UI/ops action registry에서 제외한다.
- `docs/current-screens.md` 충돌은 피드백 공개·관리 API 경계와 Gov24/sync tombstone 계약을 모두 보존하는 방식으로 해결했다.

## 검증

- Gov24 env/cache/freshness 집중 테스트 — PASS, 6 files / 16 tests
- `tests/security-route-capability-matrix.test.mjs` — PASS, 39 tests
- `corepack pnpm sec:scan:routes` — PASS, mutation methods 126 / classified 126 / disabled 2
- scanner 대상 ESLint — PASS
- `corepack pnpm browser-storage:check` — PASS, 35 files
- `corepack pnpm planning:ssot:check` — PASS, 5 files / 11 tests
- `corepack pnpm deps:audit` — PASS, 662 packages / 687 versions / advisories 0
- `DATABASE_URL=postgresql://finance:finance@127.0.0.1:5432/finance corepack pnpm verify` — PASS, 833 files / 3,004 tests
- `DATABASE_URL=postgresql://finance:finance@127.0.0.1:5432/finance corepack pnpm build` — PASS, 250 static pages
- `DATABASE_URL=postgresql://finance:finance@127.0.0.1:5432/finance corepack pnpm e2e:rc` — PASS, 38 passed / 2 skipped
- `corepack pnpm multi-agent:guard` — PASS
- `git diff --check` — PASS
- 독립 전체 변경분 정적 리뷰 — actionable P1/P2 없음
- 원격 GitHub Actions는 새 head 게시 뒤 다시 확인한다.

## 남은 리스크

- Daily Refresh scheduler는 `MOIS_BENEFITS_API_KEY`와 HTTPS `MOIS_BENEFITS_API_URL`이 없거나 잘못되면 의도적으로 fail closed한다. 운영 secrets 구성은 저장소 밖 배포 환경 책임이다.
- stale snapshot과 upstream 부분 실패는 마지막 성공 자료를 표시할 수 있으므로 UI의 기준 시점·오류 안내를 함께 읽어야 한다.
- 실제 외부 Gov24/MOIS upstream 호출은 비밀값을 사용하지 않는 로컬 검증 범위에서 실행하지 않는다.
- scanner는 정적 규칙 기반이므로 범용 CFG와 임의 동적 호출을 완전 증명하지는 않는다. 현재 저장소의 126개 mutation method는 전부 단일 분류로 검증했다.
- `scan=all`은 정확성을 위해 결과 cache를 우회하므로 일반 조회보다 계산 비용이 크다.
- 원격 브랜치 재작성 전 기존 head 고정 `--force-with-lease`를 사용하고, 새 head의 필수 checks를 다시 확인해야 한다.

## 다음 작업

- 기존 PR #269의 base를 `main`으로 변경하고 브랜치를 기존 head 고정 `--force-with-lease`로 안전하게 재작성한다.
- 새 필수 checks를 모두 통과시킨 뒤 head/base/diff/mergeability를 재확인하고 병합한다.
- 병합 뒤 GitHub repository secrets에 `MOIS_BENEFITS_API_KEY`, `MOIS_BENEFITS_API_URL`을 등록하기 전까지 Daily Refresh가 fail closed하는 운영 상태를 명시적으로 인계한다.
