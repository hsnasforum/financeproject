# 2026-03-12 planning-v3 news settings save scope alignment closeout

## 변경 파일
- `src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`
- `tests/planning-v3-news-settings-ui.test.tsx`

## 사용 skill
- `planning-gate-selector`: `news/settings` 저장 의미 보완 배치에서 필요한 최소 검증을 `vitest + eslint + build + guard`로 고르기 위해 사용
- `work-log-closeout`: 오늘 closeout note를 저장소 규칙에 맞춰 정리하기 위해 사용

## 변경 이유
- manager 재분해 결과, `alert rules` draft까지 메인 `설정 저장` 범위처럼 보이지만 실제 저장 API는 `news settings/exposure`와 `alert rules`가 분리돼 있어, 사용자가 메인 저장 버튼으로 alert rules가 반영된다고 오해할 수 있었습니다.
- 직전 배치에서 `alert rules` quick edit와 load failure 안내는 닫혔지만, 저장 의미가 분리되지 않으면 여전히 핵심 UX 리스크가 남습니다.
- 이번 배치는 route/API 계약을 바꾸지 않고, 메인 저장 버튼과 `alert rules` 섹션의 책임 범위를 문구와 활성 조건으로 맞추는 최소 사용자 보완입니다.

## 핵심 변경
- `NewsSettingsClient`에 `settingsDirty`와 `alertRulesDirty`를 분리해 메인 저장 버튼은 `news settings + exposure` 변경에만 반응하도록 조정했습니다.
- alert rule draft 변화는 별도 helper로 계산하고, 상단 hero/하단 sticky 문구는 `alert rules`가 아래 `적용` 버튼으로 반영된다는 점을 분명히 표시하도록 바꿨습니다.
- `alert rules` 섹션에 “이 섹션의 적용 버튼으로만 저장된다”는 상태 문구를 추가해 메인 저장 범위와 분리했습니다.
- load failure 시 `details`가 접힌 채 오류가 숨어버리지 않도록 alert rules panel open 조건을 helper로 고정했습니다.
- `tests/planning-v3-news-settings-ui.test.tsx`에 save scope 분리, panel open 조건, alert rules apply 상태 문구 계약을 추가했습니다.
- route/current-screens/runbook 계약은 바뀌지 않아 docs는 수정하지 않았습니다.

## 검증
- `pnpm test tests/planning-v3-news-settings-ui.test.tsx tests/planning-v3-news-alerts-ui.test.tsx tests/planning-v3-news-alert-rules-api.test.ts tests/planning-v3-news-settings-remote-host-api.test.ts`
- `pnpm exec eslint src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-settings-ui.test.tsx`
- `pnpm build`
- `git diff --check -- src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-settings-ui.test.tsx work/3/12/2026-03-12-planning-v3-news-settings-save-scope-alignment-closeout.md`
- `pnpm multi-agent:guard`

## 남은 리스크
- 이번 배치에서 `alert rules`와 메인 저장 버튼의 저장 의미 mismatch는 닫혔습니다.
- `topicId`, `seriesId`, `metric`, `targetType`, `targetId`처럼 구조를 바꾸는 고급 필드는 여전히 JSON 보조 경로에 남아 있고, guided input으로 올릴지는 별도 기능 배치에서 판단해야 합니다.
- 실제 `save/apply/reload/deep-link` 사용자 플로우는 아직 static/helper 테스트 위주라, 다음 단계에서 필요하면 메인 단독 `pnpm e2e:rc`로 좁은 회귀를 추가하는 편이 안전합니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
