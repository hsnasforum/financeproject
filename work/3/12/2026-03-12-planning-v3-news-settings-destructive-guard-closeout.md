# 2026-03-12 planning-v3 news settings destructive guard closeout

## 변경 파일
- `src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`
- `tests/planning-v3-news-settings-ui.test.tsx`

## 사용 skill
- `planning-gate-selector`: `news/settings` alert-rules 후속 배치에서 필요한 최소 검증을 `vitest + eslint + build + guard`로 고르기 위해 사용
- `work-log-closeout`: 오늘 closeout note를 저장소 규칙에 맞춰 정리하기 위해 사용

## 변경 이유
- manager 재분해 결과, `settingsDirty`와 `alertRulesDirty`가 동시에 남아 있는 상태에서 메인 `설정 저장`이 `load()`를 통해 로컬 alert-rules draft를 덮어쓸 수 있는 mixed-dirty 유실 리스크가 확인됐습니다.
- 같은 맥락에서 `현재값 불러오기`/재로드가 미적용 draft를 날릴 수 있고, load failure 뒤 `적용`이 빈 오버라이드를 저장할 수 있는 destructive path도 남아 있었습니다.
- 이번 배치는 route/API 계약을 바꾸지 않고, `news/settings`에서 alert-rules draft 유실 가능성과 section-level in-flight 혼동을 막는 최소 사용자 보호 장치입니다.

## 핵심 변경
- `NewsSettingsClient`에 `canSaveNewsSettings`와 mixed-dirty 상태 문구를 추가해, alert-rules 미적용 변경이 남아 있으면 메인 `설정 저장`을 차단하도록 맞췄습니다.
- `handleSave()`에도 같은 가드를 넣어 버튼 우회 호출 시에도 alert-rules draft를 먼저 적용하거나 되돌리도록 안내합니다.
- `현재값 불러오기`와 failure 재로드는 미적용 draft가 있을 때 실행되지 않도록 막아 로컬 draft 파기를 방지했습니다.
- load failure가 남아 있는 동안 `적용`을 막고, alert-rules 섹션 상태 문구를 `idle/reloading/applying`으로 분리해 현재 동작이 더 명확히 보이게 했습니다.
- alert-rules 섹션의 첫 버튼 라벨을 `현재값 불러오기`로 바꿔 실제 동작을 사용자 문구와 맞췄습니다.
- `tests/planning-v3-news-settings-ui.test.tsx`에 mixed-dirty save 차단 helper와 section status 문구 계약을 추가했습니다.

## 검증
- `pnpm test tests/planning-v3-news-settings-ui.test.tsx tests/planning-v3-news-alerts-ui.test.tsx tests/planning-v3-news-alert-rules-api.test.ts tests/planning-v3-news-settings-remote-host-api.test.ts`
- `pnpm exec eslint src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-settings-ui.test.tsx`
- `pnpm build`
- `git diff --check -- src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-settings-ui.test.tsx work/3/12/2026-03-12-planning-v3-news-settings-destructive-guard-closeout.md`
- `pnpm multi-agent:guard`

## 남은 리스크
- 이번 배치에서 mixed-dirty save overwrite, draft 파기 재로드, load-failure 상태의 빈 적용 리스크는 닫혔습니다.
- `seriesId`, `metric`, `targetType`, `targetId` 같은 고급 필드는 여전히 JSON 보조 경로에 남아 있고, guided input으로 승격할 최소 범위는 별도 기능 배치에서 정하는 편이 안전합니다.
- 실제 브라우저 사용자 플로우는 아직 static/helper 테스트 중심이라, 다음 단계에서 필요하면 메인 단독 `pnpm e2e:rc`로 좁은 회귀를 추가하는 편이 안전합니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
