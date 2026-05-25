# 2026-05-25 테스트/e2e 기준선 안정화

## 변경 파일
- `tests/daily-brief-route.test.ts`
- `tests/disclosure-alerts-route.test.ts`
- `tests/news-brief-route.test.ts`
- `tests/news-search-index.test.ts`
- `tests/planning-v3-news-alerts-api.test.ts`
- `tests/planning-v3-news-search-api.test.ts`
- `tests/planning-v3-write-route-guards.test.ts`
- `tests/planning/ui/workspaceGroups.test.ts` `[untracked 기존 상태]`
- `tests/e2e/helpers/e2eTest.ts`
- `tests/e2e/data-sources-settings.spec.ts`
- `src/components/DataSourceImpactCardsClient.tsx`
- `src/components/DataSourcePingButton.tsx`
- `src/components/PlanningReportsDashboardClient.tsx`
- `src/components/planning/PlanningQuickStartGate.tsx`
- `src/components/planning/workspace/useWorkspaceArrivalHandoff.ts` `[untracked 기존 상태]`
- `src/app/planning/v3/news/settings/_components/newsSettings/sections.tsx` `[untracked 기존 상태]`
- `work/5/25/2026-05-25-test-baseline-stabilization.md`

## 사용 skill
- `finance-skill-routing`: 이번 라운드의 기본 skill과 조건부 skill 범위를 고르기 위해 사용
- `planning-gate-selector`: 테스트 중심 변경과 사용자 흐름 변경에 맞는 검증 범위를 고르기 위해 사용
- `dart-data-source-hardening`: DART/data-source 상태와 fallback 안내가 실패 상태에서도 깨지지 않는지 확인하기 위해 사용
- `route-ssot-check`: planning/news/report/runs 경로 변경이 실제 사용자 경로 계약을 약화하지 않는지 확인하기 위해 사용
- `work-log-closeout`: 실제 수정 파일, 실행 검증, 남은 리스크를 `/work` 형식으로 기록하기 위해 사용

## 변경 이유
- dev DART/news route 테스트가 `guardDevReadRequest` 추가 이후 `Request` 없이 handler를 호출해 실패했습니다.
- news 검색/알림 테스트가 실제 현재 날짜에 의존해 fixture 기준일이 검색 범위 밖으로 밀렸습니다.
- planning workspace 테스트 기대값이 현재 controller 계약의 `initialSelectedProfile: null`을 반영하지 못했습니다.
- e2e에서는 dev HMR guard와 hydration 타이밍 때문에 DART/data-source/planning/report 버튼 클릭과 focus handoff가 실제 사용자 흐름보다 먼저 실행됐습니다.
- news settings 알림 규칙 해시 진입은 follow-through 링크를 바로 확인해야 하지만, `<details>`가 닫힌 상태로 남을 수 있었습니다.

## 전달 변경
- dev DART/news brief/alerts route 테스트가 로컬 host `Request`를 넘기도록 조정했습니다.
- news search/alerts API 테스트와 search index 테스트 기준 시각을 `2026-03-05T00:00:00.000Z`로 고정했습니다.
- planning v3 write guard 테스트에서 실제 refresh side effect가 있는 `/api/planning/v3/news/refresh`는 정상 경로 런타임 probe만 제외하고 차단/정적 guard 검증은 유지했습니다.
- quickstart 입력/미리보기/다음 단계, data-source ping, report save 버튼은 hydration 전 비활성화해 클릭 손실을 막았습니다.
- planning quickstart 도착 focus는 대상 버튼 렌더 지연을 짧게 재시도하도록 보강했습니다.
- data-source impact 카드는 hydration 중 놓친 ping localStorage 상태를 effect 시작 시 다시 읽도록 보강했습니다.
- news settings 알림 규칙 패널은 기본 open 상태로 두고, 안내 문구를 e2e follow-through 계약과 맞췄습니다.
- e2e HMR guard는 `/planning`, `/planning/runs`, `/planning/reports`, `/public/dart`, `/settings/data-sources`처럼 hydration 상호작용이 검증 대상인 경로에서는 건너뛰도록 조정했습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- bash -lc 'NO_COLOR=1 corepack pnpm exec vitest run tests/daily-brief-route.test.ts tests/disclosure-alerts-route.test.ts tests/news-brief-route.test.ts tests/news-search-index.test.ts tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-search-api.test.ts tests/planning-v3-write-route-guards.test.ts tests/planning/ui/workspaceGroups.test.ts'` 통과: 8 files / 20 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PLAYWRIGHT_REUSE_EXISTING_SERVER=0 NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec playwright test tests/e2e/dart-flow.spec.ts tests/e2e/planning-quickstart-preview.spec.ts tests/e2e/news-settings-alert-rules.spec.ts tests/e2e/data-sources-settings.spec.ts tests/e2e/flow-history-to-report.spec.ts --workers=1 --reporter=line` 통과: 17 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test` 통과: 653 files / 2015 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm lint` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm build` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin PLAYWRIGHT_REUSE_EXISTING_SERVER=0 NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm e2e:rc` 통과: 23 tests
- `git diff --check -- <이번 라운드 확인 파일>` 통과

## 특이 사항
- 첫 `pnpm e2e:rc` 직접 실행은 wrapper 내부 `spawn pnpm ENOENT`로 즉시 실패했습니다. PATH에 `/tmp/codex-pnpm-shim`을 명시해 같은 `e2e:rc`를 재실행했고 통과했습니다.
- `e2e:rc` 로그에 `housing:sales` upstream 404가 남았지만 data-source ping은 안전한 상태 표시로 처리됐고 테스트는 통과했습니다.
- `NO_COLOR`는 상위 `FORCE_COLOR` 때문에 일부 Node 경고를 냈지만 검증 결과에는 영향이 없었습니다.

## 남은 리스크
- 현재 worktree에는 이번 라운드 밖의 대규모 기존 변경과 untracked 파일이 많이 남아 있어, 전체 품질 판단은 축별로 계속 분리해야 합니다.
- `src/components/PlanningReportsDashboardClient.tsx` 등 일부 파일에는 이번 라운드 전부터 있던 변경이 섞여 있습니다. 이번 라운드에서 의도적으로 조정한 부분은 hydration 전 버튼 비활성화와 e2e 안정화 관련 동작입니다.
- `tests/planning/ui/workspaceGroups.test.ts`, `src/components/planning/workspace/useWorkspaceArrivalHandoff.ts`, `src/app/planning/v3/news/settings/_components/newsSettings/sections.tsx`는 현재 untracked 경로에 있으므로 최종 PR 정리 시 포함 범위를 별도로 확인해야 합니다.
