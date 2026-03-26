# 2026-03-25 planning-v3 news settings panel-contrast hierarchy frontend-skill spike

## 변경 파일
- `src/app/planning/v3/news/settings/page.tsx`
- `src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`

## 사용 skill
- `frontend-skill`: 카드 수를 늘리지 않고 app workspace 기준으로 surface tone, section band, 제한된 motion으로 위계를 다시 세우기 위한 기준으로 사용.
- `planning-gate-selector`: route/data 계약을 건드리지 않는 page + client UI 변경에 맞는 최소 검증 세트를 고르기 위해 사용.
- `route-ssot-check`: `/planning/v3/news/settings` 실존 경로와 `docs/current-screens.md` 기준을 다시 확인하고 route/href 변경이 없는지 고정하기 위해 사용.
- `work-log-closeout`: 이번 라운드의 실제 변경, 실행 검증, 미실행 검증, 남은 리스크를 `/work` 형식에 맞춰 남기기 위해 사용.

## 변경 이유
- 현재 패널과 섹션이 같은 흰색 계열로 겹쳐 보여 경계와 우선순위가 약하다.
- `/planning/v3/news/settings` 첫 화면에서 주요 작업영역과 보조 패널의 시작점이 약해 scan rhythm이 흐려진다.
- global theme나 shared component를 건드리지 않고 이 화면 한 곳에서만 single-surface UI spike로 대비와 위계를 또렷하게 시험할 필요가 있다.

## 핵심 변경
- [변경 전 메모] 수정 대상 파일: `src/app/planning/v3/news/settings/page.tsx`, `src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`
- [변경 전 메모] 변경 이유: 현재 패널과 섹션이 같은 흰색 계열로 겹쳐 보여 경계와 우선순위가 약하다.
- [변경 전 메모] 실행할 검증 명령: `pnpm test tests/planning-v3-news-settings-ui.test.tsx`, `pnpm lint`, `pnpm build`
- visual thesis: 밝은 neutral canvas 위에 한 단계 내려앉은 작업면과 더 옅은 보조 밴드를 겹쳐 첫 시선이 저장 액션과 핵심 설정 구역으로 바로 모이게 만든다.
- content plan: 상단 작업 요약/저장 영역, 내 상황 프로필 band, 소스·토픽 편집 workspace, 고급 관리·알림 규칙 inspector
- interaction thesis: 초기 진입 시 상단 작업면의 짧은 fade-up, 각 section의 미세한 stagger reveal, hover/focus 시 inset panel tone이 한 단계 또렷해지는 강조만 사용한다.
- 페이지 바탕에 이 화면 전용 `bg-slate-100/80` 단계를 추가하고, hero 내부를 `현재 저장 상태 + 빠른 이동 + 작업 순서`로 재배치해 첫 화면이 “작업영역 + 보조 컨텍스트” 구조로 읽히게 바꿨다.
- `내 상황 프로필`, `소스 우선순위`, `토픽 키워드`는 반복 white card 대신 band/inset/list row 위주로 재구성해 section header, 입력면, 상태면의 위계를 분리했다.
- `고급 관리 및 알림 규칙`은 오른쪽 inspector 성격의 보조 패널로 분리하고, `#news-settings-alert-rules` anchor와 follow-through link(`/planning/v3/news/alerts`, `/planning/v3/news`)는 그대로 유지했다.
- 실제 바뀐 패널 구분 방식: 페이지 배경 step 1단, main white workspace, `bg-slate-50` section band, white inset panel, emerald accent 상태/저장 영역 1곳만 강조하는 4층 구조로 정리했다.
- 다른 화면으로 확장할지 여부: 이번 라운드에서는 확장하지 않고 `/planning/v3/news/settings` 한 곳에서만 spike로 유지한다.

## 검증
- `pnpm test tests/planning-v3-news-settings-ui.test.tsx` — 통과
- `pnpm lint` — 통과 (기존 저장소 전반의 `no-unused-vars` 경고 25건 유지, 이번 라운드에서 새 error는 없음)
- `pnpm build` — 통과
- `git diff --check -- src/app/planning/v3/news/settings/page.tsx src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx work/3/25/2026-03-25-planning-v3-news-settings-panel-contrast-hierarchy-frontend-skill-spike.md` — 통과
- [미실행] `pnpm e2e:rc` — 기존 selector/data-testid, `href`, flow hook를 바꾸지 않았고 `tests/e2e/news-settings-alert-rules.spec.ts`가 의존하는 `#news-settings-alert-rules`/링크 계약도 유지해 이번 라운드 기본 검증에서 제외했다.

## 남은 리스크
- 모바일에서 tone 분리는 유지되지만, 실제 디바이스 기준으로 section 길이가 더 길어졌을 때 sticky 보조 패널 체감이 충분한지는 추가 시각 점검이 필요하다.
- `pnpm lint`의 경고 다수는 기존 저장소 상태이며, 이번 파일에도 사용되지 않는 타입 alias 경고가 남아 있다. 이번 라운드는 single-surface UI spike 범위라 정리하지 않았다.
- route, data, contract, `docs/current-screens.md`는 변경하지 않았다. 이후 다른 `planning/v3` 화면으로 확장할 때는 이번 tone hierarchy가 공통 패턴이 될지 별도 검토가 필요하다.
