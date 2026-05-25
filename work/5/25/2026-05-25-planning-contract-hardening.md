# 2026-05-25 planning 핵심 경로 계약 하드닝

## 변경 파일
- `package.json`
- `scripts/planning_v2_regression.mjs`
- `src/components/PlanningReportsDashboardClient.tsx`
- `src/components/planning/workspace/usePlanningWorkspaceController.tsx` `[untracked 기존 상태]`
- `src/components/planning/workspace/useWorkspaceProfileBundle.ts` `[untracked 기존 상태]`
- `tests/e2e/planning-v2-fast.spec.ts`
- `tests/planning/ui/workspaceProfileBundle.test.ts` `[untracked 기존 상태]`
- `work/5/25/2026-05-25-planning-contract-hardening.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기준으로 이번 라운드 우선순위를 planning 핵심 경로로 좁히기 위해 사용
- `planning-gate-selector`: planning v2 complete/regress, build, e2e:rc 검증 범위를 정하기 위해 사용
- `route-ssot-check`: `/planning/reports` export handoff와 route SSOT 영향 여부를 확인하기 위해 사용
- `work-log-closeout`: 변경 파일, 검증, 남은 리스크를 `/work` 형식으로 기록하기 위해 사용

## 변경 이유
- `/planning?profileId=...` 진입 직후 사용자가 새 프로필 작성을 위해 입력값을 수정하면, 늦게 도착한 같은 프로필 hydration 응답이 편집값을 다시 서버 값으로 덮어쓸 수 있었습니다.
- `/planning/reports` 화면은 export route가 존재하고 route test도 있었지만, 사용자가 화면에서 HTML export로 이어지는 버튼 계약이 약했습니다.
- `planning:v2:regress`는 회귀 fixture 계산 자체보다 현재 날짜에 따라 `SNAPSHOT_STALE` 경고가 추가되는 시간 의존 실패가 있었습니다.
- `planning:v2:e2e:full`은 isolated planning 데이터 디렉터리를 공유하면서 2 worker 병렬 실행 시 navigation 취소가 발생할 수 있었습니다.

## 전달 변경
- workspace profile bundle에 local edit 플래그와 same-profile late hydration 차단 helper를 추가해, 저장 전 사용자의 편집값을 늦은 hydration이 덮어쓰지 못하게 했습니다.
- quickstart/wizard/sample/JSON 적용처럼 사용자가 편집 영역을 바꾸는 경로는 local edit로 표시되게 정리했습니다.
- 리포트 dashboard에 `HTML 저장` 버튼을 추가해 현재 선택 실행의 `/api/planning/reports/[runId]/export.html` 다운로드로 이어지게 했습니다.
- `planning-v2-fast` e2e에서 HTML export 버튼의 접근성 이름과 실제 다운로드 파일명을 확인하도록 보강했습니다.
- regression runner는 기본 기준일을 `2026-03-05T00:00:00.000Z`로 고정하고, `PLANNING_V2_REGRESSION_NOW_ISO`로 재정의할 수 있게 했습니다.
- `planning:v2:e2e:full`은 `--workers=1`로 고정해 shared isolated planning storage 경쟁을 줄였습니다.

## Route SSOT 확인
- 실제 경로: 기존 API route `/api/planning/reports/[runId]/export.html`를 UI 버튼에서 호출합니다.
- 문서 기준과의 차이: public page route를 추가하지 않았으므로 `docs/current-screens.md` 갱신은 필요하지 않습니다.
- 필요한 수정: 없음.
- 실행한 가드: `pnpm planning:ssot:check` 통과.
- 남은 리스크: `baseRunId`, `recommendRunId` deep link UI 계약은 아직 직접 e2e가 얇습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/planning/ui/workspaceProfileBundle.test.ts tests/planning/ui/workspaceGroups.test.ts` 통과: 2 files / 7 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin PLAYWRIGHT_REUSE_EXISTING_SERVER=0 NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec playwright test tests/e2e/planning-v2-fast.spec.ts --grep "keeps unsaved profile edits" --workers=1 --reporter=line` 통과: 1 test
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin PLAYWRIGHT_REUSE_EXISTING_SERVER=0 NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec playwright test tests/e2e/planning-v2-fast.spec.ts --grep "/planning/reports shows run-based dashboard" --workers=1 --reporter=line` 통과: 1 test
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm planning:v2:complete` 통과: 6 e2e 포함
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm planning:v2:regress` 통과: regression 9 cases + full e2e 8 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test` 통과: 653 files / 2016 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm lint` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm build` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin PLAYWRIGHT_REUSE_EXISTING_SERVER=0 NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm e2e:rc` 통과: 23 tests
- `git diff --check -- <이번 라운드 확인 파일>` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm planning:ssot:check` 통과: 5 files / 9 tests

## 특이 사항
- 첫 `planning:v2:regress`는 회귀 비교 9건에서 `SNAPSHOT_STALE` 추가로 실패했습니다. 기준일 고정 후 회귀 비교는 통과했습니다.
- 두 번째 `planning:v2:regress`는 내부 `spawn pnpm ENOENT`로 full e2e 시작에 실패했습니다. PATH에 `/tmp/codex-pnpm-shim`을 명시해 재실행했습니다.
- full e2e 병렬 실행 중 `page.goto net::ERR_ABORTED`가 한 번 발생했습니다. `planning:v2:e2e:full`을 `--workers=1`로 고정한 뒤 통과했습니다.
- `planning:v2:guard`는 `ROUTE_INVENTORY_MISSING_TOP_LEVEL /fonts`와 `[v2-core-change]` 태그 부재를 informational warning으로 남겼습니다.
- `e2e:rc` 중 `housing:sales` upstream 404 로그가 남았지만 안전 fallback으로 처리됐고 테스트는 통과했습니다.

## 남은 리스크
- 현재 worktree에는 이번 라운드 밖의 대규모 기존 변경과 untracked 파일이 많습니다. PR 전 포함 범위 정리가 필요합니다.
- `src/components/planning/workspace/usePlanningWorkspaceController.tsx`, `src/components/planning/workspace/useWorkspaceProfileBundle.ts`, `tests/planning/ui/workspaceProfileBundle.test.ts`는 현재 untracked 경로라 최종 stage 범위를 별도로 확인해야 합니다.
- `baseRunId`, `recommendRunId` deep link UI 계약은 구현과 일부 저장 흐름 검증은 있으나, 직접 URL 복원 e2e는 추가 여지가 있습니다.
