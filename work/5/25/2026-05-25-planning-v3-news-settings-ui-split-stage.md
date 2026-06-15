# 2026-05-25 planning v3 news settings UI split stage

## 변경 파일
- `src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`
- `src/app/planning/v3/news/settings/_components/newsSettings/sections.tsx`
- `src/app/planning/v3/news/settings/_components/newsSettings/shared.ts`
- `src/app/planning/v3/news/settings/_components/newsSettings/useNewsSettingsController.ts`
- `tests/planning-v3-news-alerts-api.test.ts`
- `tests/planning-v3-news-search-api.test.ts`
- `work/5/25/2026-05-25-planning-v3-news-settings-ui-split-stage.md`

## 사용 skill
- `planning-gate-selector`: planning v3 news settings의 React component, page import, selector/e2e 영향을 기준으로 focused lint, unit/API/UI test, e2e, build 검증을 선택했습니다.
- `work-log-closeout`: 실제 변경 파일, 실행한 명령, 남은 리스크를 `/work` 형식으로 정리했습니다.

## 변경 이유
- `NewsSettingsClient`가 API 호출, 상태 계산, helper, 고급 설정 UI를 한 파일에 포함해 변경 범위가 컸습니다.
- 뉴스 설정 화면의 shell은 유지하고 controller/shared/sections 경계로 나눠 후속 알림 규칙, 소스, 토픽 UI 수정의 회귀 범위를 줄이기 위함입니다.
- news alerts/search API 테스트의 기준 시점을 고정해 날짜 의존 회귀를 줄입니다.

## 핵심 변경
- `NewsSettingsClient`는 `PageShell` 조립과 section wiring만 담당하도록 축소했습니다.
- 뉴스 설정 조회/저장, exposure profile, source/spec JSON IO, alert rules apply/reload 상태를 `useNewsSettingsController`로 분리했습니다.
- alert rule JSON 파싱, 상태 문구, exposure/source/topic draft 변환 helper를 `newsSettings/shared.ts`로 이동했습니다.
- hero, exposure, sources, topics, advanced 영역을 `newsSettings/sections.tsx` section 컴포넌트로 분리했습니다.
- alerts/search API 테스트에 fake timer 기준 시각을 추가해 결과 생성 시점을 안정화했습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git diff --check -- src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx src/app/planning/v3/news/settings/_components/newsSettings tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-search-api.test.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec eslint src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx src/app/planning/v3/news/settings/_components/newsSettings/sections.tsx src/app/planning/v3/news/settings/_components/newsSettings/shared.ts src/app/planning/v3/news/settings/_components/newsSettings/useNewsSettingsController.ts tests/planning-v3-news-settings-ui.test.tsx tests/planning-v3-news-settings-remote-host-api.test.ts tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-search-api.test.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-search-api.test.ts` 통과: 2 files, 7 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm typecheck` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/planning-v3-news-settings-ui.test.tsx tests/planning-v3-news-settings-remote-host-api.test.ts tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-search-api.test.ts` 통과: 4 files, 12 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec playwright test tests/e2e/news-settings-alert-rules.spec.ts --workers=1 --reporter=line` 통과: 1 test
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm build` 1차는 6분 제한에서 timeout되어 exit code를 확보하지 못했습니다. 프로세스 종료 확인 뒤 재실행했습니다.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm build` 재실행 통과: 254 pages 생성
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm worktree:scope src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx src/app/planning/v3/news/settings/_components/newsSettings tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-search-api.test.ts tests/planning-v3-news-settings-ui.test.tsx tests/planning-v3-news-settings-remote-host-api.test.ts work/5/25/2026-05-25-planning-v3-news-settings-ui-split-stage.md` 통과: 전체 변경 118, 범위 내 7, 범위 밖 111

## 남은 리스크
- 이번 라운드는 `/planning/v3/news/settings`와 alert rules follow-through만 focused e2e로 확인했습니다. 전체 `pnpm e2e:rc`는 PR 최종 전 다시 실행하는 편이 안전합니다.
- 현재 worktree에는 planning workspace, transaction batch detail, planner wizard 등 범위 밖 변경 111개가 남아 있습니다.
- `details#news-settings-alert-rules`는 e2e 기대와 맞춰 열린 상태를 유지합니다.

## 다음 라운드
- transaction batch detail UI 분리 후보를 다음 pathspec 묶음으로 검토합니다.
- planning workspace 대형 분리 후보는 별도 라운드에서 UI unit test와 사용자 플로우 e2e 범위를 다시 고정합니다.
