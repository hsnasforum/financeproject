# 2026-07-13 Issue #237 mutation capability와 운영 명령 경계 분리

## 변경 파일

- HTTP 실행 차단: `src/app/api/gov24/sync/route.ts`, `src/app/api/sync/smoke/route.ts`
- Gov24 freshness·외부 snapshot 반영: `src/app/api/gov24/search/route.ts`, `src/app/api/gov24/simple-find/route.ts`, `src/app/api/gov24/detail/route.ts`, `src/lib/publicApis/benefitsSnapshot.ts`, `src/lib/publicApis/benefitsFlowContract.ts`
- 사용자·운영 UI 실행 경계: `src/components/Gov24Client.tsx`, `src/components/DebugUnifiedClient.tsx`, `src/components/data/DataFreshnessBanner.tsx`, `src/components/DoctorSummaryCard.tsx`
- 간접 HTTP 실행 제거: `src/lib/dev/fixCatalog.ts`, `src/lib/dev/runScript.ts`, `src/lib/ops/actions/registry.ts`, `src/lib/ops/actions/types.ts`, `src/lib/ops/opsTicketParser.ts`, `src/lib/diagnostics/doctorSummary.ts`, `src/lib/diagnostics/fixFailureAnalyzer.ts`
- Capability registry·scanner: `scripts/security_route_registry.mjs`, `scripts/security_route_guard_scan.mjs`
- 예약 실행 계약: `.github/workflows/daily-refresh.yml`, `scripts/daily_refresh.mjs`, `scripts/daily_refresh_contract.mjs`, `scripts/warm_if_stale.mjs`
- 문서·SSOT: `docs/current-screens.md`, `docs/gov24-sync.md`, `docs/debug-unified.md`, `docs/daily-refresh.md`, `docs/browser-storage-inventory.json`, `src/lib/security/trustedOrigin.ts`
- 회귀 테스트: `tests/security-route-capability-matrix.test.mjs`, `tests/gov24-route-guards.test.ts`, `tests/sync-smoke-route.test.ts`, `tests/gov24-sync-entrypoint-contract.test.ts`, `tests/gov24-search-freshness.test.ts`, `tests/benefits-snapshot.test.ts`, `tests/benefits-gov24-flow-contract.test.ts`, `tests/gov24-sync-if-stale.test.ts`, `tests/data-freshness-banner-copy.test.tsx`, `tests/run-script-sanitize.test.ts`, `tests/doctor-fix-auth.test.ts`, `tests/fix-history-store.test.ts`, `tests/fix-failure-analyzer.test.ts`, `tests/ops-ticket-parser.test.ts`, `tests/planning/ops/actions-run-route.test.ts`, `tests/planning/ops/ops-source-actions.test.ts`, `tests/daily-refresh-ci-contract.test.ts`, `tests/daily-refresh-workflow-contract.test.ts`, `tests/daily-refresh-ops-contract.test.ts`

## 사용 skill

- `finance-skill-routing`: 업로드된 goal/review의 #237 범위에 필요한 최소 skill 조합 선택
- `planning-gate-selector`: API·UI·scanner·scheduler 변경에 맞는 집중/전체/build/E2E 검증 세트 선택
- `dart-data-source-hardening`: Gov24 설정 누락, stale snapshot, 외부 CLI 교체, 부분 실패 안내 계약 점검
- `route-ssot-check`: 비활성화한 HTTP 실행 경계와 `docs/current-screens.md` 정합성 검증
- `github:github`: Issue #237과 기존 PR/Issue 상태 확인
- `github:yeet`: 스택형 branch 범위 확인, 의도적 commit·push·draft PR 게시 절차 적용
- `work-log-closeout`: 변경 파일, 실제 검증, 잔여 위험, 다음 라운드 인계 형식 정리

## 변경 이유

- 업로드된 `financeproject_repository_review_2026-07-12.md`와 `financeproject_codex_goal_2026-07-12.md`를 확인한 결과, origin/CSRF만으로 고비용 mutation의 실행 권한을 충족했다고 볼 수 없었습니다.
- Gov24 전체 동기화와 live smoke가 HTTP 요청 안에서 장시간 작업 또는 process를 시작할 수 있어, 명시적 운영 명령 경계로 닫을 필요가 있었습니다.
- CLI-only 전환 뒤에도 dev/ops action, OPS ticket, UI, daily scheduler에서 간접 실행 또는 잘못된 실행 안내가 남지 않도록 같은 계약을 함께 정리했습니다.

## 핵심 변경

- `POST /api/gov24/sync`와 `POST /api/sync/smoke`는 production에서 404, 그 외 환경에서 CLI 안내가 포함된 403만 반환하며 runner·child process를 호출하지 않습니다. `ALLOW_LOCAL_SYNC`는 이 경계를 열지 않습니다.
- mutation scanner는 126개 mutation을 low/medium/high와 profile로 1회씩 분류하고, `auth`, `authorization`, `locality`, `origin/csrf`, `rate-limit`, `audit` 6축을 독립 검증합니다. 분기 호환성, 명시적 internal-token/local-ops 대안, provider 결과 소비, 정확한 tombstone 응답 쌍도 검사합니다.
- Gov24 사용자 결과는 stale snapshot을 계속 안전하게 제공하되 `snapshot_stale`과 쉬운 한국어 안내를 함께 반환합니다. 외부 CLI가 snapshot을 atomic replace/delete하면 웹 프로세스 메모리 cache가 파일 identity 변화로 다시 읽습니다.
- 공개/Debug/Data Freshness UI와 dev/ops action에서 Gov24·daily·smoke HTTP 실행을 제거하고, 실제 executor allowlist와 OPS ticket parser를 단일화했습니다.
- daily scheduler는 MOIS key/HTTPS URL을 preflight와 실행 단계에 전달하며, warm 단계는 `--exchange-only`로 실행해 같은 daily run에서 FinLife/Gov24 전체 스캔을 중복 시작하지 않습니다.

## 검증

- `DATABASE_URL=file:./prisma/dev.db corepack pnpm exec vitest run ...` — 집중 PASS. 최종 scanner/daily 묶음 5 files / 43 tests, runtime 보완 묶음 10 files / 63 tests
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm exec vitest run --reporter=dot --silent` — PASS, 830 files / 2,968 tests
- `corepack pnpm lint` — PASS, 오류·경고 없음
- `corepack pnpm typecheck` — PASS
- `corepack pnpm typecheck:planning` — PASS
- `corepack pnpm typecheck:planning:v3` — PASS
- `corepack pnpm sec:scan:routes` — PASS, mutation 126 / classified 126 / disabled 2 / low 2 / medium 75 / high 49
- `corepack pnpm browser-storage:check` — PASS, files 35
- `corepack pnpm planning:ssot:check` — PASS, 5 files / 11 tests
- `corepack pnpm release:verify` — PASS. dependency audit 취약점 0, planning complete, fast E2E 8건, multi-agent guard, compat/regression/readiness, 전체 test, advisory SSOT를 포함해 종료 코드 0
- `git diff --check 8267399de0ee14bca002ba620751519359a386a3` — PASS
- `DATABASE_URL=file:./prisma/dev.db NEXT_BUILD_HEARTBEAT_MS=20000 corepack pnpm build` — PASS, 250개 static page 생성 포함 종료 코드 0
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:rc` — PASS, 38 passed / 2 skipped
- GitHub Actions PR #269 — CI run `29202116426`, E2E run `29202116417` 모두 job step과 log가 생성되기 전에 즉시 실패했습니다. 모든 job이 `steps=null`, `logs_url=null`이라 코드 실패로 판정할 근거가 없으며 기존 runner/billing 외부 차단과 같은 상태입니다.

## 남은 리스크

- CLI/scheduler는 HTTP caller rate limit 대상이 아니며, 서로 다른 프로세스의 수동 CLI와 scheduler가 겹칠 때 사용할 cross-process lock과 durable audit log는 아직 없습니다. 같은 daily run 내부의 중복 호출만 제거했습니다.
- `benefits_snapshot.json.tmp`는 고정 임시 경로이므로 독립 CLI 두 개가 동시에 실행되면 충돌할 수 있습니다. 운영 명령은 한 번에 하나만 실행해야 합니다.
- Capability scanner는 현재 route를 정적으로 대조해 실제 오분류가 없음을 독립 재감사했지만, 범용 control-flow·guard dominance를 완전 증명하는 권한 엔진은 아닙니다. 고위험 tombstone은 별도 runtime matrix test에도 의존합니다.
- DART corp-code build HTTP는 internal token 또는 local-ops 대안으로 분류되지만 rate limit·audit는 아직 없습니다. #237의 Gov24/smoke 차단과 분리해 후속 보안 범위로 남깁니다.
- `/api/dev/*`와 일반 `/api/ops/*`의 로컬성·origin 계약은 실제 사용자 인증을 대신하지 않습니다. 배포 모드와 auth readiness는 Issue #232/#233에서 통합해야 합니다.
- GitHub Actions Secrets의 실제 등록 여부는 저장소 코드에서 확인할 수 없습니다. 누락 시 새 preflight가 안전하게 실패합니다.
- `freshness:autoSmoke` legacy backup key는 이전 backup 호환을 위해 읽기 allowlist에 남지만 현재 UI와 실행 경로에서는 사용하지 않습니다.
- 이 branch는 PR #268의 #236 경계 위에 쌓였으며, #236이 변경되면 rebase와 전체 보안 matrix 재검증이 필요합니다.

## 다음 라운드 우선순위

- Draft PR #269는 `codex/236-feedback-boundary` 기준으로 게시됐으며, 외부 runner/billing 차단이 해소되면 원격 CI/E2E를 다시 확인합니다.
- 1차 PR 세트 뒤 Issue #232/#233의 배포 모드·인증 readiness를 별도 작은 PR로 진행합니다.
