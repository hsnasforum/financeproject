# 2026-03-12 planning-v3 news settings alert rules ui closeout

## 변경 파일
- `src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`
- `tests/planning-v3-news-settings-ui.test.tsx`

## 사용 skill
- `planning-gate-selector`: `news/settings` 사용자 화면 보완 배치에서 필요한 최소 검증을 `vitest + eslint + build + guard`로 고르기 위해 사용
- `work-log-closeout`: 오늘 closeout note를 저장소 규칙에 맞춰 정리하기 위해 사용

## 변경 이유
- 직전 배치에서 `news/alerts/rules` API 계약은 닫혔지만, 실제 `planning/v3/news/settings` 화면에는 이 API를 쓰는 caller가 없어 기능이 route 수준에만 남아 있었습니다.
- 비전문가용 화면 기준으로도 알림 규칙은 sources/specs와 같은 고급 설정 축인데, 현재는 JSON override를 조정할 표면이 없어 기능 공백이 있었습니다.
- 이번 배치는 새 route를 추가하지 않고 기존 설정 화면 안에서 `alerts/rules`를 안전하게 노출하는 최소 보완입니다.

## 핵심 변경
- `NewsSettingsClient`에 `alerts/rules` GET/POST를 읽고 쓰는 고급 관리 섹션을 추가했습니다.
- 페이지 초기 load에서 `alerts/rules`를 optional fetch로 읽어 오버라이드 JSON과 현재 유효 규칙 표를 채우도록 했고, 이 fetch 실패가 핵심 settings/profile load를 깨지 않도록 분리했습니다.
- 설정 화면 hero anchor에 `알림 규칙` 이동 링크를 추가하고, 고급 관리 안에 `알림 규칙 오버라이드` details를 넣었습니다.
- 사용자는 현재 오버라이드 개수, 활성 규칙 수, 유효 규칙 요약 표를 보고 같은 화면에서 오버라이드 JSON을 내보내기/적용할 수 있습니다.
- `tests/planning-v3-news-settings-ui.test.tsx`를 추가해 설정 화면에 새 섹션과 anchor가 실제로 렌더링되는지 고정했습니다.
- route/current-screens/runbook 계약은 바뀌지 않아 docs 업데이트는 하지 않았습니다.

## 검증
- `pnpm test tests/planning-v3-news-settings-ui.test.tsx tests/planning-v3-news-alert-rules-api.test.ts tests/planning-v3-news-settings-remote-host-api.test.ts`
- `pnpm exec eslint src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-settings-ui.test.tsx`
- `pnpm build`
- `git diff --check -- src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-settings-ui.test.tsx work/3/12/2026-03-12-planning-v3-news-settings-alert-rules-ui-closeout.md`
- `pnpm multi-agent:guard`

## 남은 리스크
- 이번 배치의 `news/settings alerts/rules caller 공백` blocker는 없습니다.
- 새 섹션은 고급 JSON 오버라이드 편집 표면이라, 이후 비전문가용 폼 편집으로 확장할지 여부는 별도 기능 배치로 판단해야 합니다.
- `multi-agent:guard`의 `latestWorkNote`는 tracked note 기준이라 이번 untracked closeout이 최신 note로 바로 반영되지 않을 수 있습니다. 현재 guard PASS면 운영 blocker는 아닙니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
