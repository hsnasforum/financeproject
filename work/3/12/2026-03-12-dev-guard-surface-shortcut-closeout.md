# 2026-03-12 dev guard surface shortcut closeout

## 변경 파일
- `src/components/DevUnlockShortcutLink.tsx`
- `src/components/AutoMergePolicyClient.tsx`
- `src/components/OpsPlanningFeedbackClient.tsx`
- `src/components/FeedbackDetailClient.tsx`
- `src/components/StickyAgendaBar.tsx`
- `src/components/LabelingClient.tsx`
- `src/components/AutoMergeClient.tsx`
- `src/components/RulesOpsClient.tsx`
- `src/components/DoctorSummaryCard.tsx`
- `src/components/OpsDashboardClient.tsx`
- `src/components/OpsDataQualityCard.tsx`
- `tests/dev-unlock-shortcut.test.ts`
- `work/3/12/2026-03-12-dev-guard-surface-shortcut-closeout.md`

## 사용 skill
- `planning-gate-selector`: dev guard UI/helper 변경을 `vitest + eslint + planning:current-screens:guard + build`로 좁혀 검증 세트를 고정하는 데 사용했다.
- `route-ssot-check`: `/ops/rules` 링크를 더 넓게 노출하는 변경이 실제 경로와 `docs/current-screens.md`의 support/ops 경로 계약을 깨지 않는지 확인하는 데 사용했다.
- `work-log-closeout`: 이번 라운드의 실제 변경, 실제 검증, 전역 스캔 근거를 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- 최근 closeout 기준으로 `Dev unlock/CSRF` raw 경고 표면이 일부 남아 있었고, 운영자가 클릭 가능한 `/ops/rules` 복구 링크 없이 텍스트만 보게 되는 경로가 남아 있었다.
- 전역 스캔에서 dev guard 문구를 가진 컴포넌트 중 helper 또는 `ErrorState`를 전혀 쓰지 않는 표면이 `AutoMergeClient`, `AutoMergePolicyClient`, `DoctorSummaryCard`, `FeedbackDetailClient`, `LabelingClient`, `OpsDashboardClient`, `OpsDataQualityCard`, `OpsPlanningFeedbackClient`, `RulesOpsClient`, `StickyAgendaBar`로 확인됐다.
- `/ops/rules`는 실제 경로가 `src/app/ops/rules/page.tsx`에 존재하고 `docs/current-screens.md`에도 support/ops 경로로 문서화돼 있어, 새 경로 추가 없이 복구 링크를 수렴시키는 것이 이번 배치의 가장 작은 안전한 수정이었다.

## 핵심 변경
- `src/components/DevUnlockShortcutLink.tsx`에 `DevUnlockShortcutMessage`를 추가해 raw 경고 메시지 뒤에 `/ops/rules 바로가기`를 동일 기준으로 붙일 수 있게 했다.
- `AutoMergePolicyClient`, `OpsPlanningFeedbackClient`, `AutoMergeClient`, `OpsDataQualityCard`의 no-csrf 배너와 오류 표면을 새 helper로 수렴시켰다.
- `FeedbackDetailClient`, `StickyAgendaBar`, `DoctorSummaryCard`, `RulesOpsClient`, `LabelingClient`, `OpsDashboardClient`의 동적 오류/복구 메시지에도 같은 helper를 연결했다.
- 대표 회귀로 `tests/dev-unlock-shortcut.test.ts`에 generic helper 렌더와 `OpsPlanningFeedbackClient`, `OpsDataQualityCard` no-csrf 배너 렌더를 추가했다.
- 전역 재스캔에서 dev guard 문구를 가진 컴포넌트 중 helper 또는 `ErrorState`가 전혀 없는 표면이 더 이상 남지 않음을 확인했다.

## 검증
- `pnpm exec vitest run tests/dev-unlock-shortcut.test.ts`
- `pnpm exec eslint src/components/DevUnlockShortcutLink.tsx src/components/AutoMergePolicyClient.tsx src/components/OpsPlanningFeedbackClient.tsx src/components/FeedbackDetailClient.tsx src/components/StickyAgendaBar.tsx src/components/LabelingClient.tsx src/components/AutoMergeClient.tsx src/components/RulesOpsClient.tsx src/components/DoctorSummaryCard.tsx src/components/OpsDashboardClient.tsx src/components/OpsDataQualityCard.tsx tests/dev-unlock-shortcut.test.ts`
- `pnpm planning:current-screens:guard`
- `rg --files src/app -g 'page.tsx' | rg '/ops/rules/page\\.tsx$'`
- `rg -n "^/ops/rules|ops/rules" docs/current-screens.md src/app -g '!node_modules'`
- `git diff --check -- src/components/DevUnlockShortcutLink.tsx src/components/AutoMergePolicyClient.tsx src/components/OpsPlanningFeedbackClient.tsx src/components/FeedbackDetailClient.tsx src/components/StickyAgendaBar.tsx src/components/LabelingClient.tsx src/components/AutoMergeClient.tsx src/components/RulesOpsClient.tsx src/components/DoctorSummaryCard.tsx src/components/OpsDashboardClient.tsx src/components/OpsDataQualityCard.tsx tests/dev-unlock-shortcut.test.ts`
- `for f in $(rg -l "Dev unlock/CSRF|Dev unlock 및 CSRF|동일 origin|로컬 환경|localhost/local only" src/components src/app | sort); do rg -q "DevUnlockShortcut(Link|Message)|ErrorState" "$f" || echo "$f"; done`
- `git status --short | awk '{print $2}' | awk ' /^src\\/app\\/api\\/planning\\/v3\\// || /^src\\/lib\\/planning\\/v3\\// || /^planning\\/v3\\// || /^tests\\/planning-v3/ {bucket["planning-v3"]++; next} /^src\\/app\\/planning\\/reports\\// || /^src\\/components\\/PlanningReports/ || /^tests\\/planning\\/reports\\// || /^tests\\/planning-reports/ || /^src\\/app\\/planning\\/_components\\// || /^src\\/app\\/planning\\/_lib\\// {bucket["planning-report"]++; next} /^src\\/lib\\/dart\\// || /^src\\/app\\/api\\/public\\/disclosure\\// || /^src\\/app\\/api\\/dev\\/data-sources\\// || /^src\\/components\\/DataSource/ || /^tests\\/dart/ || /^tests\\/data-source/ || /^docs\\/data-sources/ {bucket["dart-data-sources"]++; next} /^scripts\\// || /^next\\.config\\.ts$/ || /^playwright\\.config\\.ts$/ || /^package\\.json$/ || /^README\\.md$/ || /^docs\\/release/ || /^docs\\/maintenance/ || /^docs\\/runbook/ {bucket["runtime-release"]++; next} /^work\\// || /^multi_agent\\.md$/ || /^\\.codex\\// {bucket["multi-agent-worklog"]++; next} /^docs\\// {bucket["docs-other"]++; next} {bucket["other"]++} END {for (name in bucket) print name, bucket[name]}' | sort`
- `pnpm build`

## 남은 리스크
- 이번 배치의 dev guard raw shortcut 리스크는 닫혔다. `for f in ...` 재스캔 결과 helper 또는 `ErrorState` 없이 남은 표면은 없었다.
- 전역 스캔 기준 큰 dirty worktree는 여전히 `planning-v3 141`, `runtime-release 43`, `planning-report 36`, `docs-other 32`, `dart-data-sources 25`, `multi-agent-worklog 68`, `other 350` 규모라 다음 라운드도 기능축별 작은 batch 분리가 필요하다.
- 현재 활성 dev runtime이 있어 `pnpm build`는 isolated `.next-build`로 통과했고 shared prune는 skip 됐다. 최종 릴리즈 전 single-owner 순차 게이트 원칙은 계속 필요하다.

## 다음 라운드 우선순위
- `planning-v3` 변경군을 별도 batch로 잘라 전용 closeout과 최소 검증 세트를 다시 고정
- `runtime-release` 축에서 wrapper 로그 정규화와 `next.config.ts` 글로벌 계약 범위를 따로 분리
- `other 350`으로 남아 있는 대규모 혼합 변경을 기능축 기준으로 더 잘게 나눠 release 후보와 실험 변경을 분리
