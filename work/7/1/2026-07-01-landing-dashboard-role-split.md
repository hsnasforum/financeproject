# 2026-07-01 Landing dashboard role split

## 변경 파일
- `src/app/page.tsx`
- `src/app/_lib/landingContent.ts`
- `src/components/home/LandingReportPreview.tsx`
- `src/app/dashboard/page.tsx`
- `src/app/dashboard/_lib/dashboardViewModel.ts`
- `src/components/DashboardClient.tsx`
- `src/components/PlanningRunsClient.tsx`
- `tests/home-landing-page.test.tsx`
- `tests/dashboard-view-model.test.tsx`
- `docs/current-screens.md`

## 사용 skill
- `planning-gate-selector`: page/route/UI 변경에 필요한 검증 범위를 고르는 데 사용했습니다.
- `route-ssot-check`: `/`와 `/dashboard` 역할 문서와 실제 route surface를 맞추는 데 사용했습니다.
- `playwright`: `e2e:rc` 실패 원인 확인과 clean data 재검증에 사용했습니다.
- `work-log-closeout`: 변경 후 `/work` 종료 기록 형식을 맞추는 데 사용했습니다.

## 변경 이유
- `/`가 public landing, 최근 실행 dashboard, benefit handoff, data trust status를 동시에 맡아 run/report/profile 변경에 직접 영향을 받았습니다.
- `/dashboard`는 run 목록 로드 실패를 빈 실행 기록처럼 흡수해 no-run과 load-failure를 구분하지 못했습니다.

## 핵심 변경
- `/`에서 `listRuns`, `safeBuildReportVMFromRun`, `getProfile`, `buildPlanningBenefitSignals` 의존을 제거하고 정적 landing content와 sample preview만 렌더링하게 했습니다.
- landing copy와 샘플 리포트 preview를 `landingContent`/`LandingReportPreview`로 분리했습니다.
- `/dashboard` run 로딩을 서버 VM(`loadDashboardViewModel`)으로 분리하고 `loaded`/`failed` 상태를 클라이언트에 명시적으로 전달했습니다.
- `DashboardClient`가 no-run, has-run, load-failure를 서로 다른 문구와 CTA로 표시하게 했습니다.
- `PlanningRunsClient`는 현재 선택한 실행과 체크한 비교 실행 1개만 있어도 비교 요약을 만들 수 있게 보강했습니다. 누적 e2e 데이터 환경에서 checkbox 상태 경합으로 비교 요약이 비어 보이던 회귀를 막기 위한 최소 보완입니다.
- `docs/current-screens.md`의 `/`와 `/dashboard` 역할 설명을 실제 구현과 맞췄습니다.

## 검증
- `rg -n -e listRuns -e safeBuildReportVMFromRun -e getProfile -e buildPlanningBenefitSignals src/app/page.tsx src/app/dashboard src/components/home`: PASS, root page 직접 의존 없음. `listRuns`는 dashboard VM 안에만 남음.
- `pnpm vitest run tests/home-landing-page.test.tsx tests/dashboard-view-model.test.tsx tests/planning/ui/homeQuickRulesStatus.test.tsx`: PASS, 3 files / 7 tests
- `pnpm planning:current-screens:guard`: PASS, 5 files / 9 tests
- `pnpm planning:ssot:check`: PASS, 5 files / 9 tests
- `pnpm typecheck`: PASS
- `pnpm lint`: PASS
- `pnpm test`: PASS, 746 files / 2471 tests
- `PORT=3131 ... pnpm e2e:rc`: PASS, 24 passed / 1 skipped. 기존 e2e 데이터와 분리한 clean data root에서 실행했습니다.
- `pnpm build`: PASS
- `git diff --check -- ...`: PASS

## 재시도한 실패
- 기본 `.data/planning-e2e`를 쓰는 `pnpm e2e:rc`는 21 passed / 1 skipped / 3 failed였습니다. 원인은 #120 변경 화면이 아니라 누적 e2e 데이터 1477개 파일과 다수 vault profile로 `/planning/runs` 초기 렌더가 35초 이상 걸려 60초 제한을 소모한 점, 그리고 같은 환경에서 비교 checkbox 상태가 한 개만 남는 경합이었습니다.
- 실패 위치만 별도 clean data root에서 재실행했을 때 `flow-history` 실패 2개가 모두 PASS였고, 전체 clean `e2e:rc`도 PASS였습니다.
- 테스트 fixture 타입 단언이 실제 run 타입과 충분히 겹치지 않아 `typecheck`가 한 번 실패했습니다. 테스트 fixture 의도에 맞게 `unknown` 경유 단언으로 고쳤고 재실행 PASS를 확인했습니다.

## 남은 리스크
- 기본 `.data/planning-e2e`에는 누적 테스트 데이터가 많아 clean root 없이 `pnpm e2e:rc`를 다시 실행하면 timeout이 재발할 수 있습니다. 테스트 데이터 prune 또는 e2e별 isolated data root 정책은 별도 정리 대상입니다.
- `/`에서 개인화 카드를 제거했기 때문에 홈에서 바로 최근 리포트로 이어가던 사용자는 `/dashboard`를 거치게 됩니다. 상단 nav와 dashboard smoke는 통과했습니다.
