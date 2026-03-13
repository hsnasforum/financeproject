# 2026-03-12 planning-v3 news settings alert-rules guided input closeout

## 변경 파일
- `src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`
- `tests/planning-v3-news-settings-ui.test.tsx`

## 사용 skill
- `planning-gate-selector`: `news/settings` alert-rules guided-input 2차 배치에서 필요한 최소 검증을 `vitest + eslint + build + e2e + guard`로 고르기 위해 사용
- `work-log-closeout`: 오늘 closeout note를 저장소 규칙에 맞춰 정리하기 위해 사용

## 변경 이유
- manager 재분해와 후속 내부회의 결과, destructive guard 이후 남아 있던 실제 공백은 `alert rules`의 고급 필드가 JSON 보조 경로에 과하게 남아 있다는 점이었습니다.
- `topicId`, `seriesId`, `metric`, `targetType`, `targetId` 같은 자주 쓰는 필드는 화면 안에서 바로 수정할 수 있어야 하고, 사용자가 현재 rule이 어느 대상에 연결되는지 즉시 읽을 수 있어야 했습니다.
- 이번 배치는 route/API 계약은 유지한 채, `news/settings`의 alert-rules 빠른 조정 표면을 guided input 중심으로 올려 JSON fallback 의존도를 줄이는 최소 기능 보완입니다.

## 핵심 변경
- `NewsSettingsClient`에 `formatAlertRuleTargetType`, `getAlertRuleTargetIdSuggestions`를 추가해 indicator rule 요약에 연결 대상이 보이도록 하고, `topic/series/scenario` 대상 suggestion을 제공하도록 맞췄습니다.
- `topic_burst` rule은 `토픽 범위` select를 추가해 전체 토픽과 개별 topic id를 JSON 없이 바로 고를 수 있게 했습니다.
- `indicator` rule은 `지표 series`, `지표 보기(metric)`, `연결 대상(targetType)`, `대상 ID(targetId)`를 guided input으로 올리고, `seriesId/targetId`는 datalist suggestion으로 보조했습니다.
- `tests/planning-v3-news-settings-ui.test.tsx`에 guided suggestion helper 계약과 `현재값 불러오기` 문구 회귀를 추가해 이번 배치의 UI 의도를 고정했습니다.

## 검증
- `pnpm test tests/planning-v3-news-settings-ui.test.tsx tests/planning-v3-news-alerts-ui.test.tsx tests/planning-v3-news-alert-rules-api.test.ts tests/planning-v3-news-settings-remote-host-api.test.ts`
- `pnpm exec eslint src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-settings-ui.test.tsx`
- `pnpm build`
- `pnpm e2e:rc`

## 남은 리스크
- `topicId/seriesId/targetType/targetId`는 guided input으로 올렸지만, `item` 대상의 실데이터 선택기나 `scenario` 후보 확장 같은 고급 lookup은 아직 정적 suggestion 수준입니다.
- 이번 배치의 사용자 표면 회귀는 `pnpm e2e:rc`까지 닫혔지만, `news/settings -> alerts/digest`에 특화된 좁은 플로우는 필요해지면 별도 e2e 배치로 더 세밀하게 고정할 수 있습니다.
- `multi-agent:guard`의 `latestWorkNote`는 tracked note 기준이라 오늘 새 closeout이 최신으로 바로 잡히지 않을 수 있습니다.

## 이번 라운드 완료 항목
- alert-rules 빠른 조정에서 자주 쓰는 고급 필드를 guided input으로 승격
- 연결 대상 요약과 datalist suggestion을 추가해 JSON-only 의존 감소
- build 및 기본 e2e 게이트까지 포함한 최종 검증 완료

## 다음 라운드 우선순위
1. `item` 대상과 richer scenario 후보를 guided picker로 올릴 최소 범위 판단
2. 필요하면 `news/settings -> alerts/digest` 좁은 브라우저 플로우를 별도 e2e로 고정
3. `other` 혼합 dirty bucket을 `DART/data-source`, `recommend/products`, `docs/runtime` 보조축으로 재분류
