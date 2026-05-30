# 2026-05-30 News settings React hooks 경고 축소 사전 계획

## 변경 파일
- `work/5/30/2026-05-30-news-settings-react-hooks-plan.md`

## 사용 skill
- `planning-gate-selector`: `useNewsSettingsController` 범위의 다음 라운드 검증 후보를 최소 범위로 분류하기 위해 사용했습니다.
- `work-log-closeout`: 오늘 `/work` 메모 형식과 사실 기반 closeout 항목을 맞추기 위해 사용했습니다.

## 변경 이유
- [사실] 이 문서는 메인 구현 마무리 전에 작성한 사전 계획 메모이며, 최종 결과는 별도 closeout 메모에서 갱신합니다.
- [사실] 최신 closeout `work/5/30/2026-05-30-weekly-plan-panel-react-compiler.md`의 다음 우선순위가 `useNewsSettingsController` 점검으로 지정돼 있었습니다.
- [사실] 현재 워크트리의 `src/app/planning/v3/news/settings/_components/newsSettings/useNewsSettingsController.ts`에는 미커밋 diff가 있으며, `load`와 state commit을 분리하고 `AbortController`/request sequence guard를 추가한 상태입니다.
- [사실] 계획 작성 시점에 `react-hooks/set-state-in-effect` 대상 ESLint를 다시 실행한 결과, 해당 경고는 재현되지 않았고 `@typescript-eslint/no-unused-vars` 1건만 남았습니다.
- [해석] 다음 라운드의 핵심은 “경고 신규 제거 구현”보다 “이미 들어간 경고 축소 refactor를 안전하게 마무리하고 관련 검증 범위를 고정”하는 쪽에 가깝습니다.

## 수정 변경
- 코드 수정은 하지 않았습니다.
- 최신 `/work` 메모, 관련 news React Compiler 메모, `useNewsSettingsController` 현재 diff, 관련 테스트 파일 후보를 확인했습니다.
- `useNewsSettingsController`의 영향 범위를 `/planning/v3/news/settings` 사용자 경로와 4개 GET, 4개 POST/IO 보조 경로까지 다시 묶었습니다.
- 다음 라운드에서는 기존 미커밋 diff를 보존한 채 `react-hooks/set-state-in-effect` 종료 여부, 잔여 lint, 관련 API/UI 회귀를 분리 검증해야 한다는 계획을 확정했습니다.

## 검증
- `Get-ChildItem -LiteralPath 'work/5/30' -File -Filter *.md | Sort-Object LastWriteTime -Descending | Select-Object -First 5 FullName,Name,LastWriteTime`
- `Get-Content -LiteralPath 'work/5/30/2026-05-30-weekly-plan-panel-react-compiler.md' | Select-Object -First 220`
- `Get-Content -LiteralPath '.codex/skills/planning-gate-selector/SKILL.md' | Select-Object -First 220`
- `Get-Content -LiteralPath '.codex/skills/work-log-closeout/SKILL.md' | Select-Object -First 220`
- `rg -n "useNewsSettingsController|set-state-in-effect|news client|route-local|shared" work/5/30 src tests docs`
- `Get-Content -LiteralPath 'work/5/30/2026-05-30-news-today-react-compiler.md' | Select-Object -First 220`
- `Get-Content -LiteralPath 'work/5/30/2026-05-30-news-digest-react-hooks-plan.md' | Select-Object -First 220`
- `Get-Content -LiteralPath 'src/app/planning/v3/news/settings/_components/newsSettings/useNewsSettingsController.ts' | Select-Object -First 260`
- `Get-Content -LiteralPath 'src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx' | Select-Object -First 220`
- `rg -n "news settings|NewsSettings|useNewsSettingsController|/api/planning/v3/news/settings|news/settings" tests src/app/api src/app/planning/v3/news/settings -g "*.ts" -g "*.tsx"`
- `Get-Content -LiteralPath 'src/app/planning/v3/news/settings/_components/newsSettings/useNewsSettingsController.ts' | Select-Object -Skip 260 -First 260`
- `rg -n "useEffect\\(|const load|setLoading\\(|setInitialLoadFailed\\(|setErrorMessage\\(|setAlertRulesLoadError\\(|setSaving\\(|setNotice\\(|setSourcesIoLoading\\(|setSpecsIoLoading\\(|setAlertRulesPhase\\(|setAlertRulesIoSummary\\(|setAlertRulesJson\\(|setInitialAlertRulesJson\\(|setIndicatorCatalog\\(|setUpdatedAt\\(|setSources\\(|setTopics\\(|setExposureDraft\\(|setInitialExposureDraft\\(|setSourceDrafts\\(|setInitialSourceDrafts\\(|setTopicDrafts\\(|setInitialTopicDrafts\\(" src/app/planning/v3/news/settings/_components/newsSettings/useNewsSettingsController.ts`
- `corepack pnpm exec eslint src/app/planning/v3/news/settings/_components/newsSettings/useNewsSettingsController.ts --rule react-hooks/set-state-in-effect:warn -f json` — FAIL, Windows UNC 경로에서 `pnpm install` 단계가 열리지 못함
- `wsl.exe -d Ubuntu --cd /home/xpdlqj/code/finance -- corepack pnpm exec eslint src/app/planning/v3/news/settings/_components/newsSettings/useNewsSettingsController.ts --rule react-hooks/set-state-in-effect:warn -f json` — PASS, `react-hooks/set-state-in-effect` 0건 / `@typescript-eslint/no-unused-vars` 1건
- `wsl.exe -d Ubuntu --cd /home/xpdlqj/code/finance -- git status --short -- src/app/planning/v3/news/settings/_components/newsSettings/useNewsSettingsController.ts work/5/30` — PASS, 대상 컨트롤러 파일 modified 확인
- `wsl.exe -d Ubuntu --cd /home/xpdlqj/code/finance -- git diff -- src/app/planning/v3/news/settings/_components/newsSettings/useNewsSettingsController.ts` — PASS
- `wsl.exe -d Ubuntu --cd /home/xpdlqj/code/finance -- sed -n '1,260p' src/app/planning/v3/news/settings/_components/newsSettings/useNewsSettingsController.ts` — PASS

## 남은 리스크
- [사실] `useNewsSettingsController.ts`에 이미 미커밋 refactor가 들어가 있어, 다음 라운드는 새 구현보다 기존 diff 검증과 마무리에 초점을 맞춰야 합니다.
- [사실] 현재 targeted ESLint 기준으로는 `react-hooks/set-state-in-effect` 경고가 재현되지 않으므로, 사용자 요청에 적힌 스캔 수치와 현재 워크트리 상태 사이에 시간차가 있습니다.
- [사실] 계획 작성 시점에는 `applyIndicatorSpecsResponse`가 unused warning을 만들고 있어, `pnpm lint`로 넓히기 전에 잔여 lint 처리 여부를 정해야 했습니다.
- [미확인] 현재 미커밋 refactor가 `handleSave`, `handleIo`, `handleAlertRulesAction`의 저장/재로딩 경로와 충돌 없이 동작하는지는 관련 테스트 재실행 전까지 확정할 수 없습니다.

## 다음 라운드 우선순위
- 메인 에이전트가 `useNewsSettingsController.ts` 현재 diff를 기준으로 `react-hooks/set-state-in-effect` 해결 여부와 잔여 `no-unused-vars` 처리 방향을 먼저 확정합니다.
- 그다음 news settings 전용 테스트와 필요한 lint/build 범위를 최소 세트로 실행해 회귀 여부를 확인합니다.
- 검증이 통과하면 one-off 전체 스캔과 `/work` closeout을 갱신하고, 남은 news 관련 경고 대상이 있으면 다음 파일로 이동합니다.
