# 2026-05-27 profile drafts list set-state 계획

## 변경 파일
- `work/5/27/2026-05-27-profile-drafts-list-set-state-plan.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: `planning/v3/profile/drafts` 표면에서 route-local 초기 로드 경계를 좁히고 계약 변경 없이 다룰 범위를 정하는 데 사용했습니다.
- `planning-gate-selector`: `ProfileDraftsListClient.tsx` 범위에 맞는 최소 검증 세트를 고르기 위해 사용했습니다.
- `work-log-closeout`: 저장소 규칙에 맞는 `/work` 종료 기록 형식을 따르기 위해 사용했습니다.

## 변경 이유
- 다음 라운드 목표가 `src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx`의 `react-hooks/set-state-in-effect` one-off 경고 축소이므로, 구현 전에 영향 범위와 검증 소유권을 먼저 고정할 필요가 있습니다.
- 오늘 최신 `/work` 메모 중 `2026-05-27-drafts-list-client-react-hooks-plan.md`가 유사한 계획 맥락을 이미 다루고 있어, 그 연장선에서 현재 대상 파일의 실제 경고 후보와 검증 범위를 다시 좁혔습니다.
- 코드 수정 없이 계획만 요청받았으므로, 이번 라운드는 파일 영향도·데이터 흐름·검증 세트만 정리하고 구현은 다음 라운드로 넘깁니다.

## 전달 변경
- `ProfileDraftsListClient.tsx`는 `useState`로 초기값을 잡은 뒤 `useEffect` 내부 149~166행에서 초기 fetch 결과에 따라 `rows`, `loadFailed`, `message`, `loading`을 다시 커밋하는 구조임을 확인했습니다.
- 자동 로드 effect와 수동 `loadDrafts()`가 모두 같은 `/api/planning/v3/profile/drafts` GET 흐름을 사용하므로, 다음 라운드 핵심은 API 계약이 아니라 초기 state commit 경계를 재배치하는 것입니다.
- 사용자 노출 경로는 `/planning/v3/profile/drafts`이며, 생성 성공 시 `/planning/v3/profile/drafts/[id]`로 이동하고, 보조 링크는 `/planning/v3/balances`, `/planning/v3/transactions/batches`를 가리킵니다.
- 현재 테스트 `tests/planning-v3-profile-drafts-ui.test.tsx`는 정적 마크업 확인 중심이라 effect 경고 재현이나 클라이언트 초기화 회귀를 직접 잡아주지 못합니다.
- 최근 `verify/` 하위 최신 산출물은 이번 조회에서 확인되지 않아, 최신 검증 근거는 오늘 `/work` 메모들과 이번 라운드의 정적 조회 결과로만 남깁니다.

## 검증
- `C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe -Command "Get-ChildItem -LiteralPath work/5/27 -File -Filter *.md | Sort-Object LastWriteTime -Descending | Select-Object -First 5 FullName,Name,LastWriteTime"`
- `Get-Content -LiteralPath 'work/5/27/2026-05-27-drafts-list-client-react-hooks-plan.md' | Select-Object -First 260`
- `Get-Content -LiteralPath 'src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx' | Select-Object -First 260`
- `rg -n "set-state-in-effect|ProfileDraftsListClient|react-hooks/set-state-in-effect" src tests`
- `rg -n "useEffect|set[A-Z][A-Za-z0-9_]*\(|useState\(" src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx`
- `rg -n -C 6 "useEffect\(|active|setRows\(|setLoadFailed\(|setLoading\(" src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx`
- `rg -n -C 4 "fetchDraftRows|useState\(|initialRows|initialLoadFailed|initialDeleteTargetId" src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx`
- `Get-Content -LiteralPath 'src/app/planning/v3/profile/drafts/page.tsx' | Select-Object -First 120`
- `Get-Content -LiteralPath 'tests/planning-v3-profile-drafts-ui.test.tsx' | Select-Object -First 240`
- `C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe -Command "Get-Content -LiteralPath '.codex/skills/planning-v3-batch-contract-narrowing/SKILL.md' | Select-Object -First 220"`
- `C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe -Command "Get-Content -LiteralPath '.codex/skills/planning-gate-selector/SKILL.md' | Select-Object -First 220"`
- `C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe -Command "Get-Content -LiteralPath '.codex/skills/work-log-closeout/SKILL.md' | Select-Object -First 220"`

## 남은 리스크
- [사실] 이번 라운드에서는 `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm e2e:rc`를 실행하지 않았습니다.
- [미확인] 실제 ESLint one-off가 effect 내부 어느 setState 호출을 직접 지목하는지는 lint 실행 로그로 다시 확인해야 합니다.
- [가정] 다음 라운드 수정은 route-local 초기 동기화 경계만 바꾸고 API payload shape, 링크, 라우트 계약은 유지하는 것이 최솟값입니다.
- [리스크] 초기 로딩 문구, 실패 문구, 빈 목록 분기 중 하나라도 state 계산 시점이 바뀌면 기존 정적 마크업 테스트 기대치가 함께 흔들릴 수 있습니다.
