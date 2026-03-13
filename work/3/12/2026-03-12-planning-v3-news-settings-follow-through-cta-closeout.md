# 2026-03-12 planning-v3 news settings follow-through CTA closeout

## 변경 파일
- `src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`
- `tests/planning-v3-news-settings-ui.test.tsx`

## 사용 skill
- `planning-gate-selector`: `news/settings` alert-rules follow-through 배치에서 필요한 최소 검증을 `vitest + eslint + build + e2e + guard`로 고르기 위해 사용
- `work-log-closeout`: 이번 라운드의 실제 변경과 검증 결과를 저장소 규칙에 맞춰 정리하기 위해 사용

## 변경 이유
- 최신 closeout과 내부 분해 결과, 이번 축의 실제 남은 공백은 `alert rules`를 적용한 뒤 사용자가 어디서 결과를 확인할지 같은 화면 안에서 이어주지 못한다는 점이었습니다.
- `item/scenario` 후보가 비어 있을 때 수동 입력 fallback은 동작하지만, 왜 직접 입력해야 하는지와 적용 뒤 어디서 확인해야 하는지가 충분히 드러나지 않았습니다.
- 이번 배치는 route/API 계약을 바꾸지 않고, `news/settings`의 alert-rules 섹션에 follow-through CTA와 더 명확한 fallback 안내를 붙이는 최소 사용자 동선 보완입니다.

## 핵심 변경
- `NewsSettingsClient`의 alert-rules 버튼 영역 아래에 `적용 뒤 결과 확인` 안내와 `/planning/v3/news/alerts`, `/planning/v3/news`로 가는 CTA를 추가했습니다.
- `item/scenario` target picker가 후보를 찾지 못할 때의 문구를 `직접 입력 + 적용 후 확인 위치`까지 포함하도록 바꿨습니다.
- 후보가 있을 때도 `바로 고른 뒤 적용하면 어디서 확인할지`가 드러나는 힌트 문구로 정리했습니다.
- `tests/planning-v3-news-settings-ui.test.tsx`에 follow-through CTA 렌더링과 item/scenario fallback 힌트 계약을 추가했습니다.
- route/current-screens/runbook 계약은 바뀌지 않아 docs는 수정하지 않았습니다.

## 검증
- `pnpm test tests/planning-v3-news-settings-ui.test.tsx tests/planning-v3-news-alerts-ui.test.tsx tests/planning-v3-news-alert-rules-api.test.ts tests/planning-v3-news-settings-remote-host-api.test.ts`
- `pnpm exec eslint src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-settings-ui.test.tsx`
- `pnpm build`
- `pnpm e2e:rc`
- `git diff --check -- src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-settings-ui.test.tsx work/3/12/2026-03-12-planning-v3-news-settings-follow-through-cta-closeout.md`
- `pnpm multi-agent:guard`

## 남은 리스크
- `item` 후보는 여전히 현재 digest top items, `scenario` 후보는 현재 scenario cache 기준이라 캐시가 비어 있으면 manual input fallback을 계속 사용합니다.
- 이번 라운드는 broad `pnpm e2e:rc`까지 닫았지만, `/planning/v3/news/settings#news-settings-alert-rules`만 겨냥한 좁은 브라우저 플로우 회귀는 필요해지면 별도 e2e 배치로 더 세밀하게 고정할 수 있습니다.
- `multi-agent:guard`의 `latestWorkNote`는 tracked note 기준이라 오늘 새 closeout이 최신으로 바로 잡히지 않을 수 있습니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
