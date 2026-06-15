# 2026-05-27 DraftsListClient react-hooks 경고 계획

## 변경 파일
- `work/5/27/2026-05-27-drafts-list-client-react-hooks-plan.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: draft/profile 표면에서 계약과 route-local 초기 로드만 분리하는 좁은 수정 원칙을 확인했습니다.
- `planning-gate-selector`: `DraftsListClient.tsx` 범위에 맞는 최소 검증 세트를 고르기 위한 기준을 확인했습니다.
- `work-log-closeout`: 계획 라운드에도 저장소 형식에 맞는 `/work` 기록을 남기기 위해 사용했습니다.

## 변경 이유
- 다음 구현 라운드 목표가 `src/app/planning/v3/drafts/_components/DraftsListClient.tsx`의 `react-hooks/set-state-in-effect` one-off 경고 1건 축소인지 먼저 분해할 필요가 있습니다.
- 직전 같은 날 `/work` 최신 기록에서 batch summary client 경고 축소가 끝났고, 다음 우선순위가 동일 파일로 이어지는 것을 확인했습니다.
- draft/profile 계약, 사용자 경로, payload shape를 바꾸지 않고 route-local 초기 로드만 조정하는 최소 수정 범위를 유지해야 합니다.

## 전달 변경
- 오늘 최신 `/work` 문서 `2026-05-27-batch-summary-client-react-compiler.md`를 읽어 이전 라운드 결과와 다음 우선순위를 이어받았습니다.
- `src/app/planning/v3/drafts/_components/DraftsListClient.tsx`를 읽어 초기 auto-load effect가 `fetchDrafts(controller.signal)` 완료 후 `rows`, `message`, `loading`을 직접 갱신하는 구조임을 확인했습니다.
- 상위 `verify/` 경로에는 최신 파일이 보이지 않아, 이번 계획 라운드에서는 직전 `/work`의 실행 검증 이력만 최신 검증 맥락으로 사용했습니다.
- 구현은 아직 시작하지 않았고, 메인 에이전트가 직접 처리할 최소 수정 단계와 병렬 가능한 조사/문서화 범위만 정리했습니다.

## 검증
- `C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe -Command "Get-ChildItem -LiteralPath work/5/27 -File -Filter *.md | Sort-Object LastWriteTime -Descending | Select-Object -First 5 FullName,Name,LastWriteTime"`
- `Get-Content -LiteralPath 'work/5/27/2026-05-27-batch-summary-client-react-compiler.md' | Select-Object -First 240`
- `Get-ChildItem -LiteralPath '.' -Directory | Select-Object Name`
- `Get-ChildItem -LiteralPath 'verify' -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 15 FullName,Name,DirectoryName,LastWriteTime`
- `C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe -Command "Get-Content -LiteralPath '.codex/skills/planning-v3-batch-contract-narrowing/SKILL.md' | Select-Object -First 220"`
- `C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe -Command "Get-Content -LiteralPath '.codex/skills/planning-gate-selector/SKILL.md' | Select-Object -First 220"`
- `C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe -Command "Get-Content -LiteralPath '.codex/skills/work-log-closeout/SKILL.md' | Select-Object -First 220"`
- `Get-Content -LiteralPath 'src/app/planning/v3/drafts/_components/DraftsListClient.tsx' | Select-Object -First 320`
- `Get-Content -LiteralPath 'src/app/planning/v3/drafts/_components/DraftsListClient.tsx' | Select-Object -Skip 320 -First 120`
- `git diff --check -- work/5/27/2026-05-27-drafts-list-client-react-hooks-plan.md`

## 남은 리스크
- [사실] 아직 lint, test, build는 실행하지 않았고 이번 라운드는 구현 전 분해와 범위 확인만 수행했습니다.
- [사실] `verify/` 하위 최신 파일이 비어 있어 별도 검증 산출물 파일 대신 직전 `/work` 문서의 검증 기록을 최신 맥락으로 사용했습니다.
- [가정] 실제 경고 축소는 batch summary client 라운드와 비슷하게 fetch 단계와 state commit 단계를 분리하는 방향이 가장 작고 안전할 가능성이 높지만, 구현 전 eslint one-off 재현으로 정확한 경고 위치를 다시 확인해야 합니다.
- [미확인] `DraftsListClient.tsx`와 연동된 draft/profile API 테스트 범위 중 어느 파일이 실제로 route-local load 타이밍 변화를 가장 잘 잡는지는 구현 후 재선정이 필요합니다.
