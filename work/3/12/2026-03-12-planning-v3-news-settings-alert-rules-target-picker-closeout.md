# 2026-03-12 planning-v3 news settings alert-rules target picker closeout

## 변경 파일
- `src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`
- `tests/planning-v3-news-settings-ui.test.tsx`

## 사용 skill
- `planning-gate-selector`: `news/settings` alert-rules target picker 보강에서 필요한 최소 검증을 `vitest + eslint + build + e2e + guard`로 고르기 위해 사용
- `work-log-closeout`: 이번 라운드의 실제 변경과 검증 결과를 저장소 규칙에 맞춰 정리하기 위해 사용

## 변경 이유
- 직전 guided-input closeout 이후 남아 있던 실제 공백은 `item` 대상과 `scenario` 대상이 여전히 free-text 또는 정적 suggestion에 가까웠다는 점이었습니다.
- 사용자가 규칙 대상을 바꾸려면 현재 digest의 대표 기사와 scenario cache를 바로 고를 수 있어야 했고, 후보가 없을 때만 직접 ID를 입력하는 흐름이 더 안전했습니다.
- 이번 배치는 route/API 계약은 바꾸지 않고, `news/settings`의 alert-rules 빠른 조정에서 target picker만 실제 앱 데이터에 연결하는 최소 기능 보완입니다.

## 핵심 변경
- `NewsSettingsClient`가 `GET /api/planning/v3/news/digest`, `GET /api/planning/v3/news/scenarios`를 optional read로 함께 불러와 최근 기사 후보와 현재 시나리오 후보를 로컬 상태로 유지하도록 맞췄습니다.
- `buildAlertRuleItemTargetCandidates`, `buildAlertRuleScenarioTargetCandidates`를 추가해 digest top item과 scenario cache에서 target candidate를 dedupe하고, 표시 라벨과 보조 설명을 만들도록 했습니다.
- indicator rule의 `targetId` 편집부에 `item/scenario` 전용 후보 select를 추가해, 현재 후보를 바로 고르거나 없을 때만 직접 입력하도록 정리했습니다.
- `targetId` datalist도 실제 기사 URL과 현재 시나리오 이름을 사용하도록 바꿨고, 현재 선택된 후보 설명이나 fallback 안내를 아래 문구로 보이게 했습니다.
- `tests/planning-v3-news-settings-ui.test.tsx`에 item/scenario candidate builder와 동적 suggestion helper 계약을 추가했습니다.

## 검증
- `pnpm test tests/planning-v3-news-settings-ui.test.tsx tests/planning-v3-news-alerts-ui.test.tsx tests/planning-v3-news-alert-rules-api.test.ts tests/planning-v3-news-settings-remote-host-api.test.ts`
- `pnpm exec eslint src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-settings-ui.test.tsx`
- `pnpm build`
- `pnpm e2e:rc`
- `git diff --check -- src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-settings-ui.test.tsx work/3/12/2026-03-12-planning-v3-news-settings-alert-rules-target-picker-closeout.md`
- `pnpm multi-agent:guard`

## 남은 리스크
- `item` 후보는 현재 digest top items, `scenario` 후보는 현재 scenario cache 기준이라 캐시가 비어 있으면 manual input fallback을 계속 사용합니다.
- 이번 라운드는 broad `pnpm e2e:rc`까지 닫았지만, `/planning/v3/news/settings -> alerts/digest`만 겨냥한 좁은 브라우저 플로우는 필요해지면 별도 e2e 배치로 더 세밀하게 고정할 수 있습니다.
- `multi-agent:guard`의 `latestWorkNote`는 tracked note 기준이라 오늘 새 closeout이 최신으로 바로 잡히지 않을 수 있습니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
