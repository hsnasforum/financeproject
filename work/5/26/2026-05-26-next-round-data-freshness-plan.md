# 2026-05-26 다음 라운드 DataFreshness 후보 계획

## 변경 파일
- `work/5/26/2026-05-26-next-round-data-freshness-plan.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기록을 기준으로 이번 라운드에 필요한 기본 skill 조합을 확인했습니다.
- `planning-gate-selector`: React hooks 경고 축소 후보에 맞는 최소 검증 세트를 정리했습니다.
- `work-log-closeout`: 계획 라운드 결과를 다음 작업자가 바로 이어받을 수 있는 `/work` 형식으로 남겼습니다.

## 변경 이유
- 직전 라운드에서 `src/components/InlineTodoEditor.tsx`의 `react-hooks/set-state-in-effect` 경고를 0건으로 줄인 뒤, 다음 라운드에서 사용자 표면과 연결된 작은 후보 하나를 안전하게 고를 필요가 있었습니다.
- 후보로 언급된 `DataFreshnessBanner`, `DoctorSummaryCard`, `Gov24Client`의 실제 경고 위치와 테스트/경로 연결 범위를 비교해 다음 구현 우선순위를 정리했습니다.

## 직접 변경
- 최신 `/work` 메모 `work/5/26/2026-05-26-inline-todo-react-compiler.md`를 읽고 잔여 경고 수와 다음 후보 메모를 확인했습니다.
- `DataFreshnessBanner`, `DoctorSummaryCard`, `Gov24Client`의 소스와 참조 경로를 읽어 사용자 표면 연결성과 변경 파급 범위를 비교했습니다.
- WSL 경유 one-off ESLint로 세 파일 모두 `react-hooks/set-state-in-effect` 2건씩 남아 있음을 확인했습니다.
- 다음 라운드 1순위 후보를 `src/components/data/DataFreshnessBanner.tsx`로 유지했습니다.

## 검증
- `Get-ChildItem -Path work -Recurse -Filter *.md | Sort-Object LastWriteTime -Descending | Select-Object -First 10 FullName,LastWriteTime`
- `Get-Content work/5/26/2026-05-26-inline-todo-react-compiler.md -TotalCount 260`
- `Get-Content .codex/skills/finance-skill-routing/SKILL.md -TotalCount 220`
- `Get-Content .codex/skills/planning-gate-selector/SKILL.md -TotalCount 260`
- `Get-Content .codex/skills/work-log-closeout/SKILL.md -TotalCount 260`
- `Get-Content src/components/data/DataFreshnessBanner.tsx -First 260`
- `Get-Content tests/data-freshness-banner-copy.test.tsx -First 220`
- `Get-Content src/components/DoctorSummaryCard.tsx -First 260`
- `Get-Content src/components/Gov24Client.tsx -First 260`
- `rg -n "DoctorSummaryCard|Gov24Client|DataFreshnessBanner" tests src/app docs/current-screens.md`
- `wsl.exe bash -lc 'cd /home/xpdlqj/code/finance && corepack pnpm exec eslint src/components/data/DataFreshnessBanner.tsx --rule react-hooks/set-state-in-effect:error'`
- `wsl.exe bash -lc 'cd /home/xpdlqj/code/finance && corepack pnpm exec eslint src/components/DoctorSummaryCard.tsx --rule react-hooks/set-state-in-effect:error'`
- `wsl.exe bash -lc 'cd /home/xpdlqj/code/finance && corepack pnpm exec eslint src/components/Gov24Client.tsx --rule react-hooks/set-state-in-effect:error'`

## 남은 리스크
- [미실행] `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm multi-agent:guard`는 이번 계획 라운드에서 다시 돌리지 않았습니다. 직전 라운드 PASS는 사용자 진술에만 의존합니다.
- [가정] `DoctorSummaryCard`는 참조 경로 검색상 사용자 공개 경로보다 운영/진단 성격이 강한 표면으로 보입니다. 실제 노출 범위는 후속 구현 직전에 한 번 더 확인하는 편이 안전합니다.
- [검증 필요] `DataFreshnessBanner`는 복사 문구 테스트는 있지만 mount 시 fetch/localStorage/sessionStorage 경로를 직접 검증하는 테스트는 보이지 않았습니다.
- 다음 라운드 우선순위는 `DataFreshnessBanner` 구현, 그다음 `Gov24Client`, 마지막으로 사용자 표면 우선순위가 낮은 `DoctorSummaryCard` 순서가 적절합니다.
