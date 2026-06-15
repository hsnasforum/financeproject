# 2026-05-27 Planning v3 news route-local client react-hooks 경고 계획

## 변경 파일
- `work/5/27/2026-05-27-news-route-local-client-react-hooks-plan.md`

## 사용 skill
- `planning-gate-selector`: planning v3 news route-local client 1건에 맞는 최소 검증 세트를 고르기 위해 사용했습니다.
- `work-log-closeout`: 이번 계획 라운드의 `/work` 기록 형식과 섹션 순서를 저장소 기준에 맞추기 위해 사용했습니다.

## 변경 이유
- 다음 라운드 목표가 `react-hooks/set-state-in-effect` one-off 경고 중 planning v3 news route-local client 1건을 줄이는 일이라, 구현 전에 대상 후보와 최소 검증 범위를 좁힐 필요가 있습니다.
- 최신 스캔 파일 `tmp/eslint-react-hooks-set-state-after-profile-drafts-list-client.json` 기준으로 전체 잔여는 51 warnings / 44 files이며, news 관련 후보만 따로 분리해 우선순위를 정해야 합니다.
- `verify/5/27` 경로는 확인되지 않아, 이번 라운드에서는 최신 스캔 파일과 오늘 `/work` 계획 문서를 최신 검증 맥락으로 사용했습니다.

## 핵심 변경
- 오늘 기존 계획 문서 `work/5/27/2026-05-27-drafts-list-client-react-hooks-plan.md`를 읽어 직전 라운드의 계획 형식과 검증 기록 방식을 이어받았습니다.
- 스캔 파일에서 planning v3 news 관련 `react-hooks/set-state-in-effect` 경고 후보를 재분류했습니다.
- news 관련 후보는 `NewsAlertsClient`, `NewsDigestClient`, `NewsExploreClient`, `NewsTodayClient`, `NewsTrendsTableClient`, `WeeklyPlanPanel`, `useNewsSettingsController`로 확인했습니다.
- route-local client 우선순위는 직접 사용자 경로를 렌더링하는 TSX 클라이언트부터 검토하고, shared hook 성격의 `useNewsSettingsController`는 후순위로 두는 방향이 안전하다고 정리했습니다.
- 구현, lint, test, build는 아직 실행하지 않았고 이번 문서는 다음 라운드 분해와 검증 기준 고정만 다룹니다.

## 검증
- `rg --files work/5/27`
- `rg -n "." work/5/27/2026-05-27-drafts-list-client-react-hooks-plan.md`
- `rg -n "." .codex/skills/planning-gate-selector/SKILL.md`
- `rg -n "." .codex/skills/work-log-closeout/SKILL.md`
- `rg -o 'planning/v3/news[^\\"]*' tmp/eslint-react-hooks-set-state-after-profile-drafts-list-client.json`
- `rg -n 'set-state-in-effect|planning/v3/news|News[A-Za-z]+Client' tmp/eslint-react-hooks-set-state-after-profile-drafts-list-client.json`

## 남은 리스크
- [사실] 각 news 후보의 실제 state commit 위치와 가장 작은 수정 방식은 아직 원본 TSX를 다시 읽어야 확정할 수 있습니다.
- [사실] `verify/5/27` 산출물은 확인되지 않았고, 이번 계획은 최신 스캔 JSON과 기존 `/work` 기록에 의존합니다.
- [가정] route-local client 1건을 줄이는 다음 라운드는 shared hook보다 직접 route에서 초기 로드를 수행하는 클라이언트를 먼저 잡는 편이 영향 경로와 검증 범위를 좁히기 쉽습니다.
- [미확인] `NewsDigestClient`와 `NewsTodayClient` 중 어느 쪽이 사용자 경로 영향 대비 수정량이 더 작은지는 구현 직전 파일 판독이 필요합니다.
