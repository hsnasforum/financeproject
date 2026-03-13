# 2026-03-12 planning-v3 news alert rules ux discoverability closeout

## 변경 파일
- `src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`
- `src/app/planning/v3/news/_components/NewsAlertsClient.tsx`
- `tests/planning-v3-news-settings-ui.test.tsx`
- `tests/planning-v3-news-alerts-ui.test.tsx`

## 사용 skill
- `planning-gate-selector`: `news/settings`와 `news/alerts` 사용자 표면 보완 배치에서 필요한 최소 검증을 `vitest + eslint + build + guard`로 고르기 위해 사용
- `work-log-closeout`: 오늘 closeout note를 저장소 규칙에 맞춰 정리하기 위해 사용

## 변경 이유
- `news/settings`에 `alerts/rules` caller를 붙인 뒤에도, 초기 표면은 JSON 오버라이드 중심이라 비전문가가 바로 규칙 on/off를 조정하기에는 진입 장벽이 남아 있었습니다.
- manager 재분해 결과, 현재 코드 기준 실제 남은 blocker는 `news/alerts` 화면의 설정 CTA가 일반 settings로만 가고 `#news-settings-alert-rules` 섹션으로 직접 떨어지지 않는 discoverability gap이었습니다.
- 이번 배치는 기존 route/API 계약을 건드리지 않고, `alert-rules` 조정 경로를 토글-first + deep-link로 수렴하는 최소 사용자 보완입니다.

## 핵심 변경
- `NewsSettingsClient`에 알림 규칙 오버라이드 JSON을 안전하게 파싱하는 helper와 기본 규칙+오버라이드 병합 helper를 추가했습니다.
- 설정 화면의 알림 규칙 섹션은 이제 규칙별 활성 토글을 먼저 제공하고, JSON은 세부 튜닝이 필요할 때만 수정하는 보조 경로로 내려갔습니다.
- 토글을 바꾸면 JSON 오버라이드가 같이 갱신되고, 현재 유효 규칙 표도 draft 기준으로 즉시 반영되도록 맞췄습니다.
- `NewsAlertsClient`의 hero `설정` 링크와 empty-state `기준 조정하기` 링크를 `/planning/v3/news/settings#news-settings-alert-rules`로 좁혀 alert rules 섹션으로 바로 이동하게 했습니다.
- `tests/planning-v3-news-settings-ui.test.tsx`에 helper/model 회귀를 추가했고, `tests/planning-v3-news-alerts-ui.test.tsx`로 alerts 화면 deep-link 계약을 고정했습니다.
- route/current-screens/runbook 계약은 바뀌지 않아 docs 업데이트는 하지 않았습니다.

## 검증
- `pnpm test tests/planning-v3-news-settings-ui.test.tsx tests/planning-v3-news-alert-rules-api.test.ts tests/planning-v3-news-settings-remote-host-api.test.ts`
- `pnpm exec eslint src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-settings-ui.test.tsx`
- `pnpm build`
- `pnpm test tests/planning-v3-news-settings-ui.test.tsx tests/planning-v3-news-alerts-ui.test.tsx tests/planning-v3-news-alert-rules-api.test.ts tests/planning-v3-news-settings-remote-host-api.test.ts`
- `pnpm exec eslint src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx src/app/planning/v3/news/_components/NewsAlertsClient.tsx tests/planning-v3-news-settings-ui.test.tsx tests/planning-v3-news-alerts-ui.test.tsx`
- `pnpm build`
- `git diff --check -- src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx src/app/planning/v3/news/_components/NewsAlertsClient.tsx tests/planning-v3-news-settings-ui.test.tsx tests/planning-v3-news-alerts-ui.test.tsx work/3/12/2026-03-12-planning-v3-news-alert-rules-ux-discoverability-closeout.md`
- `pnpm multi-agent:guard`

## 남은 리스크
- 이번 배치의 `alert-rules JSON-first UX`, `news/alerts -> alert-rules discoverability` blocker는 없습니다.
- 현재 알림 규칙 조정은 토글-first + JSON 보조 경로까지는 닫혔지만, 중요도/조건/threshold를 비전문가용 폼으로 더 세분화할지는 별도 기능 배치로 판단해야 합니다.
- `multi-agent:guard`의 `latestWorkNote`는 tracked note 기준이라 이번 untracked closeout이 최신 note로 바로 반영되지 않을 수 있습니다. 현재 guard PASS면 운영 blocker는 아닙니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
