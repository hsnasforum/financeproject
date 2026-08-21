# 2026-08-21 잔여 worktree 최종 정리

## 목적

- 파일 탐색기에 남아 있던 `finance-*` worktree 폴더를 실제 디스크 기준으로 다시 감사한다.
- 각 폴더의 미커밋·미추적 자료를 복구 가능한 상태로 보존한 뒤, 최신 `origin/main`에 없는 유효 변경만 선택 이식한다.
- 채택하지 않는 오래된 구현·검증 복사본·로컬 산출물은 제거하고, 게시 후 `/home/xpdlqj/code/finance` 하나만 남길 수 있는 상태로 닫는다.

## 시작 상태와 복구 기준

- 기준 저장소: `/home/xpdlqj/code/finance`
- 기준 SHA: `origin/main@2c9996a37128225e8ea38271aeb6adc2329f5f04`
- 통합 브랜치: `codex/294-residual-worktree-recovery`
- 통합 worktree: `/home/xpdlqj/code/finance-residual-integration-20260821`
- 저장소 밖 복구 스냅샷: `/home/xpdlqj/.local/state/finance-cleanup-20260821.U033zG`
- 복구 스냅샷은 dirty worktree 21개의 HEAD, branch, status, binary patch, 미추적 파일 tar, SHA-256 원장을 포함한다. 원본 `finance` 폴더의 `AGENTS.md` 미커밋 변경도 별도 보존했다.
- 제거된 비등록 archive의 SSH 개인키는 복사·출력·커밋하지 않았고, 비밀이 아닌 상태 메타데이터만 별도 보존했다.

## 물리 폴더 정리

1. clean detached PR 검증 폴더 16개를 제거했다: `finance-pr127-readiness`, `finance-pr147-verify`~`finance-pr157-verify`, `finance-pr161-verify`~`finance-pr163-verify`, `finance-pr163-verify-clean`.
2. 복구 스냅샷을 확인한 dirty worktree 20개를 제거했다: `finance-116-runs-load-telemetry`, `finance-236-feedback-boundary`, `finance-239-news-owner`, `finance-report-i002`~`i007`, `i009`, `i014`, `i015`, `i016`, `i017`, `i019`, `i020`, `i022`, `i024`, `i025`, `finance-safe-multi-user`.
3. Git에 등록되지 않은 `finance239-working-archive` 1개를 안전 메타데이터 보존 후 제거했다.
4. 총 37개 잔여 폴더를 제거했고, 게시 전 현재 물리 폴더는 원본 `finance`와 임시 통합 worktree 두 개뿐이다. 통합 worktree와 복구 스냅샷은 merge 결과 검증 후 제거한다.

## 최신 main에 이식한 변경

1. WSL 경로 탐색 안전 규칙: 사용자가 원본 `AGENTS.md`에 남긴 3개 안전 규칙을 보존했다.
2. 홈·메타데이터: 적금 진입 문구와 URL을 일치시키고, 죽은 홈 링크 묶음을 제거했으며, 주요 공개 화면의 실제 Next.js metadata 제목을 추가했다.
3. UI 문서: 실행 중인 디자인 토큰과 `frontend-design-spec`, `REFERENCE_UI`, `GEMINI` 설명을 일치시켰다.
4. feedback/diagnostics 경계: 공개 diagnostics snapshot route를 제거하고, feedback은 클라이언트가 보낸 snapshot·진단 헤더를 신뢰하지 않으며 서버가 최소 진단 정보만 만든다.
5. 외부 API deadline: fetch, body read, retry, Retry-After backoff 전체에 하나의 총 deadline을 적용하고 caller abort와 timeout을 구분했다. DART public route의 `request.signal`을 실제 upstream fetch까지 전달하고 공개 오류 필드를 allowlist로 제한했다.
6. 원자 snapshot: FINLIFE·Benefits 파일 쓰기를 operation-owned temp 기반 원자 교체로 바꾸고, FINLIFE 메모리 캐시를 디스크 identity에 묶어 삭제·손상·교체 뒤 stale 값을 반환하지 않게 했다.
7. 상품 option fidelity: 같은 기간의 서로 다른 option identity, nullable 기간·금리, 공시 단리·복리, 기본/최고금리 기준을 계산과 상세 화면에서 그대로 보존했다. 선택한 금리·기간·이자 방식이 없으면 계산을 보류하고 이유를 사용자에게 알린다.
8. E2E: 홈 적금 링크, 실제 metadata 제목, diagnostics 404, 상품 option identity·계산·반응형 parity를 릴리스 흐름에 추가했다.

## 이식하지 않은 변경과 근거

- planning typed storage/profile vault 묶음: broad catch가 corruption fail-closed를 다시 열고 평문 partition 재암호화가 회귀해 제외했다.
- 오래된 news owner/feedback/auth 묶음: 최신 main의 PR #268·#293 및 후속 구조로 대체됐거나 직접 entry point 보호가 불완전해 제외했다.
- FINLIFE admission/prune 묶음: 불완전·비정상 upstream 응답을 authoritative inventory로 오판해 상품·즐겨찾기를 삭제할 수 있어 제외했다.
- restore journal 묶음: checksum이 맞더라도 누락된 journal unit으로 partial restore가 가능한 위험 때문에 제외했다.
- 오래된 E2E inventory·UI 삭제·대규모 multi-user 통합본: 최신 main과 중복되거나 영향 범위가 과도하고 독립적으로 안전성을 증명하지 못해 제외했다.
- 0바이트 shell 오염, Playwright 로컬 상태, 캡처·vault 형식 자료, 임시 worktree 복사본, raw 내부 감사본: 생성물·로컬 상태·내부 정보이므로 게시하지 않았다.

## 변경 파일

- 경계·데이터: `src/lib/http/fetchExternal.ts`, `src/lib/storage/atomicJsonFile.ts`, `src/lib/finlife/`, `src/lib/publicApis/dart/`, `src/app/api/public/dart/`, `src/app/api/public/disclosure/company/route.ts`
- feedback: `src/app/api/feedback/route.ts`, `src/components/FeedbackFormClient.tsx`, 삭제된 `src/app/api/diagnostics/snapshot/route.ts`
- 상품 fidelity: `src/lib/finlife/productDetailOption.ts`, `src/lib/planning/reports/productCandidates.ts`, `src/components/products/ProductDetailDrawer.tsx`, recommendation adapter·view model
- 홈·metadata: `src/components/home/`, `src/lib/navigation/publicMetadata.ts`, 주요 page/layout metadata, `docs/frontend-design-spec.md`, `docs/ui/REFERENCE_UI.md`
- 검증: `tests/fetchExternal-*`, `tests/dart-upstream-timeout.test.ts`, `tests/finlife-*`, `tests/product-detail-*`, `tests/e2e/home-hero-carousel.spec.ts`, `tests/e2e/smoke.spec.ts`

## 실행한 검증

- `pnpm test`: 최종 재실행 852 files, 3,220 tests PASS.
  - 최초 전체 실행은 다른 Vitest 작업과 시스템 자원이 경합해 7 files/10 tests가 제한시간 초과했다.
  - 실패 7개 파일을 단일 worker로 격리 재실행해 59 tests PASS를 확인했고, 경합이 없는 전체 재실행도 모두 통과했다.
- `pnpm lint`: PASS. 마지막 E2E timeout 보정 뒤 두 spec 대상 ESLint도 PASS.
- `pnpm build`: PASS. Next.js compile, TypeScript, 246개 static page 생성과 build trace를 완료했다.
- `pnpm typecheck`: PASS.
- `pnpm e2e:rc`: 최종 재실행 46 PASS, 조건부 2 SKIP.
  - 최초 실행은 44 PASS, 2 SKIP, cold compile 대기 한도 2건 실패였다.
  - 해당 2건은 격리 재실행 2 PASS 후 전체 릴리스 흐름에서도 통과했다.
- 상품 계산 focused Vitest: 최종 3 files, 11 tests PASS. 그 전 확장 묶음 5 files, 31 tests도 PASS.
- 외부 deadline·DART·diagnostics·snapshot 관련 focused Vitest와 대상 ESLint·typecheck: PASS.
- `pnpm sec:check`: repository history·private key·client env·route mutation 분류를 포함해 PASS.
- `pnpm planning:ssot:check`: guard PASS, 5 files/11 tests PASS.
- `pnpm multi-agent:guard`: PASS. 종료 기록을 추적 대상으로 포함한 뒤 커밋 전 재실행한다.
- 정적 reviewer 재검토: 상품·비상품 변경에서 잔여 P0/P1/P2 finding 없음.

## 사용 skill

- `finance-skill-routing`: 잔여 worktree 분류와 필요한 최소 로컬 skill 선택
- `planning-gate-selector`: 데이터·route·UI·E2E 변경의 검증 범위 결정
- `codex-agent-rules-maintenance`: `AGENTS.md` WSL 안전 규칙과 agent guard 검토
- `route-ssot-check`: diagnostics 제거, metadata와 공개 route 계약 대조
- `dart-data-source-hardening`: DART signal·deadline·public error projection 검토
- `work-log-closeout`: 본 종료 기록 작성
- `github:github`: push, PR, checks, review, merge 절차 수행

## 남은 리스크

- 로컬 `e2e:rc`의 2개 SKIP은 production runtime 또는 인증 fixture 조건에서만 실행되는 기존 조건부 테스트다. GitHub required checks에서 해당 환경의 결과를 다시 확인한다.
- 게시 전까지 임시 통합 worktree와 저장소 밖 복구 스냅샷을 유지한다.

## 다음 라운드 우선순위

- PR required checks·review·충돌 여부를 확인하고 승인 범위가 같을 때 merge한다.
- PR required checks·review·충돌 확인 후 merge commit이 `origin/main`에 존재하는 것을 확인한 다음, 원본 `finance`를 최신 main과 일치시키고 임시 통합 worktree·복구 스냅샷을 제거한다.
