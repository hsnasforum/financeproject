# 2026-03-12 planning-v3 news alert rules quick edit and load state closeout

## 변경 파일
- `src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`
- `tests/planning-v3-news-settings-ui.test.tsx`

## 사용 skill
- `planning-gate-selector`: `news/settings` 사용자 표면 보완 배치에서 필요한 최소 검증을 `vitest + eslint + build + guard`로 고르기 위해 사용
- `work-log-closeout`: 오늘 closeout note를 저장소 규칙에 맞춰 정리하기 위해 사용

## 변경 이유
- manager 재분해 결과, `alerts/rules`는 deep-link만 붙어 있어도 실제 로드 실패가 빈 규칙처럼 보이면 보완 효과가 약해지고, alert rules draft는 상단 저장 상태에 반영되지 않아 사용자가 이미 저장된 것으로 오해할 수 있었습니다.
- 현재 quick edit를 확장하는 과정에서 override 비교가 기본 규칙이 아니라 이미 병합된 값 기준으로 동작하면 불필요한 override가 남는 공백도 같이 드러났습니다.
- 이번 배치는 route/API 계약을 바꾸지 않고, `news/settings` 알림 규칙 섹션에서 비전문가가 바로 이해할 수 있는 빠른 조정과 로드 실패 안내를 추가하는 최소 사용자 보완입니다.

## 핵심 변경
- `NewsSettingsClient`에 alert rule 초기값 추적과 load failure 상태를 추가해 `GET /api/planning/v3/news/alerts/rules` 실패를 “규칙 없음”이 아니라 “다시 불러오기 필요” 상태로 분리했습니다.
- alert rules draft를 기본값 기준으로 비교하도록 helper를 보강해, 토글이나 필드 값을 기본 규칙으로 되돌리면 불필요한 override가 제거되게 맞췄습니다.
- 알림 규칙 섹션에 중요도, 급증 단계, 당일 건수, 판정 조건, 비교 기간, 기준값, 기본값 복원 버튼을 추가해 공통 필드는 JSON 없이 바로 조정할 수 있게 했습니다.
- alert rules draft 차이를 dirty 계산에 포함해 상단/하단 저장 상태 문구가 실제 미적용 변경과 일치하도록 수정했습니다.
- `tests/planning-v3-news-settings-ui.test.tsx`에 quick edit helper 회귀를 추가해 기본값 복원과 필드 override 제거 계약을 고정했습니다.
- route/current-screens/runbook 계약은 바뀌지 않아 docs는 수정하지 않았습니다.

## 검증
- `pnpm test tests/planning-v3-news-settings-ui.test.tsx tests/planning-v3-news-alerts-ui.test.tsx tests/planning-v3-news-alert-rules-api.test.ts tests/planning-v3-news-settings-remote-host-api.test.ts`
- `pnpm exec eslint src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-settings-ui.test.tsx`
- `pnpm build`
- `git diff --check -- src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-settings-ui.test.tsx work/3/12/2026-03-12-planning-v3-news-alert-rules-quick-edit-and-load-state-closeout.md`
- `pnpm multi-agent:guard`

## 남은 리스크
- 이번 배치에서 `alerts/rules`의 silent fallback, draft 저장 인지, 기본 quick edit 공백은 닫혔습니다.
- `topicId`, `seriesId`, `targetType`, `targetId`처럼 구조를 바꾸는 고급 필드는 여전히 JSON 보조 경로에 남아 있고, 이는 별도 기능 배치에서 다루는 편이 안전합니다.
- `multi-agent:guard`의 `latestWorkNote`는 tracked note 기준이라 이번 untracked closeout이 최신 note로 바로 반영되지 않을 수 있습니다. 현재 guard PASS면 운영 blocker는 아닙니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
