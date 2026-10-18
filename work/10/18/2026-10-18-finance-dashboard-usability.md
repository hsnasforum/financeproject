# 2026-10-18 공식 시작·대시보드 세션 복구·환율 출처 표시

## 목표와 기준
- 목표: `pnpm start`부터 사용자 안내와 실제 동작을 맞추고, `/dashboard`에서 세션·설정 문제와 일시적 저장소 오류를 구분하며, 환율 숫자가 출처·기준일·예시 여부와 함께 보이게 합니다.
- 기준: `/home/xpdlqj/code/finance`, branch `checkpoint/finance-review-20261011`, HEAD `e474aeba6b47570e2a85f56dc14ce5f23e92a51d`.
- 기존 dirty 파일(`work/10/10/2026-10-10-finance-remaining-release-validation.md` +12, 1호의 `useWorkspaceProfileBundle.ts`·`workspaceProfileBundle.test.ts`·`tests/e2e/planning-profile-races.spec.ts`)과 미추적 `.data/planning-debug-access-check/`, `__meta/`, `tmp/`, `work/10/17/`은 건드리지 않았습니다.
- 바꾸지 않은 것: 인증 정책, provider 정책(`fx.ts`의 키 없음 → mock), 계산식, 의존성, launcher 코드.

## 변경
1. 공식 시작 경로
   - `package.json`: `start`에서 `--no-open`을 뺐습니다. 이제 `pnpm start`도 설치 바로가기·`start:local`처럼 one-shot session URL을 기본 브라우저로 넘깁니다. 앱이 이미 실행 중이면 기존 broker에서 새 session을 받아 브라우저만 다시 엽니다. bootstrap URL은 여전히 stdout에 출력하지 않습니다.
   - 호출 경로 확인: CI workflow·scripts·tests에서 `pnpm start`를 호출하는 곳은 없습니다. Playwright(`playwright.config.ts`), `planning_v2_desktop_smoke.mjs`, `planning_v2_prod_smoke.mjs`, 런타임 테스트는 launcher를 `--no-open`과 함께 직접 호출하므로 영향이 없습니다.
   - `docs/package-scripts.md`, `USER_GUIDE.md`: 자동 열기, 다시 열기 방법, 자동화는 `--no-open`으로 launcher를 직접 호출한다는 점을 적었습니다.
2. 대시보드 세션 복구
   - `src/app/dashboard/_lib/dashboardViewModel.ts`: `PlanningAuthError`는 일반 `failed`로 바꾸지 않고 다시 던집니다. 그 밖의 오류는 기존처럼 일시적 저장소 실패로 처리합니다. 인증에 실패하면 repository를 읽지 않습니다(fail-closed 유지).
   - `src/app/dashboard/page.tsx`: `/planning`과 같은 방식으로 `PlanningAuthRequiredState`를 `callbackPath="/dashboard"`로 보여 줍니다. 데스크톱 세션은 "앱 실행 경로로 다시 열어 주세요"와 `세션 다시 확인`(→ `/dashboard`)을, 웹 인증은 `/api/auth/signin?callbackUrl=%2Fdashboard`를, 저장소 모드 설정 오류는 "로컬 실행 설정 확인 필요"를 보여 줍니다.
   - `src/components/planning/PlanningAuthRequiredState.tsx`: 허용하는 callback 경로에 `/dashboard`를 추가했습니다(타입만 변경).
3. 환율 출처 표시
   - `src/components/dashboard/dashboardClientModel.ts`
     - `parseDashboardFx`: 기존 `buildFxDataStatus`(FX 도구와 같은 판정)를 재사용합니다. 출처는 `meta.provenance.source`에서 가져오고, `degradedReason: env-missing`이면 설정이 필요한 상태로 구분합니다.
     - mock일 때는 출처를 한국수출입은행으로 표기하지 않고 "예시 데이터(실제 조회값 아님)"로 표기합니다.
     - `describeDashboardFxFailure` / `parseDashboardExchange` / `describeDashboardExchangeFailure`: `ENV_*`·`CONFIG*` 코드는 설정 필요로, 그 밖의 오류는 조회 실패로 구분합니다.
     - `fetchDashboardJson`: 오류에 API `code`와 `status`를 붙입니다(메시지는 기존과 같음).
   - `src/components/dashboard/DashboardFxSection.tsx`(신규): 상태 배지(`실시간 원천 조회`/`응답 캐시 사용`/`예시 데이터`/`출처 확인 필요`/`환율 연결 설정 필요`/`환율 조회 실패`)와 신선도, `출처 … · 기준일 YYYY-MM-DD`를 보여 줍니다. 예시 값에는 `[예시]`를 붙입니다. 출처를 확인할 수 없거나 실패한 경우에는 숫자를 표시하지 않습니다. 상태 문구에 색상 외 텍스트 표시가 있고 `role="status"`를 씁니다. 기존 `/tools/fx`와 `/settings/data-sources` 동선을 그대로 씁니다.
   - `src/components/DashboardClient.tsx`: 환율 블록을 위 컴포넌트로 바꿨습니다. 다른 대시보드 기능은 바꾸지 않았습니다.
4. 테스트
   - `tests/dashboard-trust-recovery.test.tsx`(신규, 12건): 세션 복구와 FX live/cache/mock(설정 미완료)/mock(조회 실패 대체)/출처 미확인/CONFIG 실패/UPSTREAM 실패, 시장 기준 환율의 live·cache·ENV_MISSING을 검사합니다.
   - `tests/planning/desktop/desktop-launch-start-script.test.ts`(신규, 3건): `start`에 `--no-open`이 없는지, 자동화 호출이 `--no-open`을 명시하는지, workflow가 `pnpm start`를 호출하지 않는지, bootstrap URL을 stdout에 쓰지 않는지 확인합니다.
   - `tests/planning/auth/desktopRecovery.test.ts`: `/dashboard` 복귀 케이스 1건을 추가했습니다.
   - `tests/e2e/dashboard-current-state.spec.ts`: exchange fixture를 실제 route 응답 형태(`rawMeta.source: "EXIM"`, `meta.fallback`)로 맞추고, 출처 표시와 실패 시 `USD 1 = -`가 보이지 않는지 확인하는 assertion을 추가했습니다(작성만 했고 실행하지 않음).

## 검증 (WSL, Node v22.23.2 — engines 고정값 22.22.2와 다름, pnpm 9.15.9)
- 변경 전
  - start 테스트: `expected ... "--runtime prod --no-open"` 실패.
  - 세션 복구 3건 실패: 데스크톱 세션 오류가 `runsLoadState: "failed"`가 되고 "최근 플랜 다시 불러오기" 재시도 화면이 렌더링됨.
  - FX: 같은 suite에서 모듈이 없어 실패.
- 변경 후
  - `corepack pnpm exec vitest run <대시보드·auth·desktop·fx·접근성·writerRegistry·ops-dashboard·planningPublicWorkspaceBoundary·planning-v3-draft-debt-cashflow 10개 파일> --exclude ".claude/**" --exclude "work/**"` → exit 0, 10개 파일 98건 통과.
  - `corepack pnpm exec eslint <변경 파일>` → exit 0, 오류 0건. 경고 1건은 기존 `window.location.assign`입니다.
  - `corepack pnpm exec tsc --noEmit --incremental false` → 오류 3건이 모두 이번 변경과 무관한 오래된 `.next/types`에 있습니다(존재하지 않는 `api/finlife/pension` route). 변경 파일의 오류는 0건입니다.
  - `tsc --noEmit -p tsconfig.playwright.json` → `work/` 밖 오류 0건. `work/local/**` 증거 사본에서 나온 오류만 있습니다.
- **정정(id10)**
  - 위 98건 결과와 `exit 0`은 원시 로그 파일이 없어 독립 확인이 불가능합니다.
  - 당시 tsc의 `TSC_EXIT=0`, `TSC_PW_EXIT=0` 표시는 잘못이었습니다. Windows 쪽에서 `wsl.exe ... bash -lc "...; echo ...=$?"`로 실행해 `$?`·`${PIPESTATUS}`가 bash에 도달하기 전에 바깥 셸이나 `wsl.exe`에서 확장된 것으로 보입니다.
  - 아래 id10 로그에서는 스크립트 파일을 `wsl.exe -e bash <script>`로 실행했고, 실제 자식 exit 코드를 기록했습니다. tsc의 실제 exit 코드는 2입니다.

## 미검증·남은 조건
- build, 서버, 브라우저, E2E는 실행하지 않았습니다(1호 소유). 실제 `pnpm start` 브라우저 열기, `/dashboard` 세션 복구 화면, 변경한 E2E spec은 통합 runtime에서 확인되지 않았습니다.
- headless Linux처럼 기본 브라우저 opener가 없는 환경에서 `pnpm start`를 실행하면 launcher가 기존 계약대로 실패 처리하고 종료합니다(`start:local`·설치 바로가기와 같은 동작). 이런 환경에서는 launcher를 `--no-open`으로 직접 호출해야 하며, 이 경우 세션을 얻을 방법은 없습니다.
- 대시보드 보조 도구(환율)는 여전히 펼칠 때만 불러옵니다. `/tools/fx` 화면은 이번 범위가 아니어서 바꾸지 않았습니다.

## id10 보완 (GPT 리뷰 P2-1·P2-2, 테스트 수집·타입 범위)
### 변경
- **P2-1** `src/components/dashboard/dashboardClientModel.ts` `parseDashboardFx`
  - 공용 `buildFxDataStatus` 판정은 그대로 씁니다.
  - 공용 판정 결과가 live/cache여도 다음 중 하나면 대시보드에서는 `unavailable`("출처 확인 필요")로 내리고 숫자를 숨깁니다.
    - `meta.provenance.mode`가 명시적인 `live`/`cache`가 아님(예: 알 수 없는 mode에 cache hit)
    - `provenance.source`가 없음
  - meta 전체가 없을 때와 route가 합성한 legacy-cache provenance(source 없음)도 숫자를 숨깁니다.
  - 명시적 mock은 기존처럼 `[예시]`를 붙여 표시합니다.
  - `fxDataStatus.ts`, provider, route, 다른 화면은 바꾸지 않았습니다.
- **P2-2** `parseDashboardExchange`
  - exchange route의 `meta.fallback.reason`이 `live_failed_cache_hit` 또는 `cooldown_cache_hit`이면 새 상태 `degraded-cache`로 구분합니다.
  - 숫자·출처·기준일은 유지하고, 상태 표시를 "최신 조회 실패 · 저장된 응답 표시" / "조회 재시도 대기 · 저장된 응답 표시"로 바꿉니다.
  - 안내 문구를 추가합니다. `nextRetryAt`이 있으면 기존 `formatDashboardDateTime`으로 "다음 조회 가능 시각"을 함께 보여 줍니다.
  - 정상 `cache_hit`은 기존 "응답 캐시 사용"을 유지합니다. `DashboardExchange`에 `nextRetryAt` 필드를 추가했습니다.
- `src/components/dashboard/DashboardFxSection.tsx`: `degraded-cache`일 때 숫자 줄 아래에 안내(`role="status"`)와 `/settings/data-sources` 링크를 표시합니다.
- `tests/dashboard-trust-recovery.test.tsx`
  - FX 숫자 숨김 4건(source 누락 / 알 수 없는 mode + cache hit / legacy-cache / meta 누락)을 추가했습니다.
  - mock `[예시]` 유지 1건, exchange 정상 cache와 degraded 2종의 화면 차이 1건, nextRetryAt 없음 1건을 추가했습니다.
  - id7에서 `live_failed_cache_hit`을 `cache`로 기대한 기존 assertion을 `degraded-cache`로 정정했습니다. 이 assertion은 P2-2 결함을 정상으로 고정하고 있었습니다.
- `vitest.config.ts`: git-ignored 증거 사본만 정확히 제외했습니다.
  - `.claude/worktrees/**`
  - `work/local/*/baseline-source/**`
  - `work/local/*/evidence/**`
  - `tests/`에서 옮겨진 proof 파일 3개(정확한 경로). 이 파일들의 `./helpers`·`../src` import는 `tests/` 위치에서만 해석됩니다.
  - `work/**` 전체나 `tests/**` 제한은 쓰지 않았습니다.
- `tsconfig.playwright.json`: `exclude`를 부모 `tsconfig.json`과 같은 `["node_modules", "tmp/**", "work/local/**", ".next/dev/**", ".dist/**"]`로 복원했습니다. `tmp/**` 조건은 유지됩니다.

### 검증 (원시 로그: `/home/xpdlqj/code/finance/tmp/finance-dashboard-usability-20261018/`)
- Node: 실측 v22.23.2. package.json `engines.node`는 22.22.2로, 서로 다릅니다. pnpm은 9.15.9, vitest는 4.1.11입니다.
- 수정 전: `vitest-before-p2.log`
  - `corepack pnpm exec vitest run tests/dashboard-trust-recovery.test.tsx` → vitest child exit code 1, 19건 중 4건 실패.
  - 실패 4건: source 누락, 알 수 없는 mode + cache hit, degraded 화면 차이, nextRetryAt 없음.
- 수정 후 1차: `vitest-after-targeted.log`
  - 타깃 10개 파일 → child exit 1, 105건 중 1건 실패. 실패한 것은 위에서 정정한 id7 assertion입니다.
- 수정 후 2차: `vitest-after-targeted-2.log`
  - 같은 10개 파일 → child exit 0, 10개 파일 105건 통과.
- 수집 목록: `collect-before.log`, `collect-after.log`, `collect-compare.log`, `*-canonical.diff`
  - `vitest list --filesOnly`: 전 3744 → 후 935(사본 2809 제거). canonical 935건은 diff exit 0으로 동일합니다. `planning/v3/**` 65건과 `src/lib/planning/engine/__tests__/financialStatus.test.ts`가 유지됩니다.
  - `tsc -p tsconfig.playwright.json --listFilesOnly`(node_modules 제외): 전 2843 → 후 2732(work/local 사본 111 제거). canonical 2732건은 동일합니다.
- 정적 검사: `static.log`, `eslint.out`, `tsc-default.out`, `tsc-playwright.out`
  - eslint(변경 파일): child exit 0.
  - `tsc --noEmit --incremental false`: child exit 2, 오류 24줄.
    - stale `.next/types`(finlife pension) 3줄은 통합 build 때 처리할 예정입니다.
    - 나머지는 1호가 진행 중인 `usePlanningWorkspaceController.tsx`·`tests/planning/ui/workspaceProfileBundle.test.ts`(profile bundle 변경 중)에서 나옵니다.
  - `tsc -p tsconfig.playwright.json`: child exit 2, 오류 21줄로 같은 1호 파일 2개뿐입니다.
  - 이번 변경 파일에서 나온 오류는 0건입니다.

### 미검증·남은 검사
- build·서버·브라우저·E2E는 실행하지 않았습니다(1호 소유).
- 통합 단계에서 1호가 확인해야 할 것:
  - 1호의 profile bundle 변경이 끝난 뒤 `tsc` 두 종류를 다시 실행하고, stale `.next`는 build로 정리
  - `tests/e2e/dashboard-current-state.spec.ts` 실행
  - 실제 `pnpm start` 브라우저 열기와 `/dashboard` 세션 복구 화면 확인

## 사용 skill
- 기존 구현 단계: 당시 사용 기록이 없어 확인하지 못했습니다.
- 이후 Git 준비 단계: 마스터가 `superpowers:finishing-a-development-branch`를 읽고 적용했습니다(`2026-10-18-finance-git-closeout.md`).
