# 2026-03-13 planning-v3 news settings section status audit

## 변경 파일
- `src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`
- `tests/planning-v3-news-settings-ui.test.tsx`
- `work/3/13/2026-03-13-planning-v3-news-settings-section-status-audit.md`

## 사용 skill
- `planning-gate-selector`: audit 결과가 실제 코드 수정으로 이어질 때 필요한 최소 검증만 고르기 위해 사용
- `work-log-closeout`: audit 결과, 실제 수정 범위, 실행한 검증, 다음 라운드를 `/work` 형식으로 남기기 위해 사용

## 변경 이유
- 최신 기준선은 `work/3/13/2026-03-13-planning-v3-news-settings-alert-rules-save-semantics-closeout.md`였고, 이번 라운드는 그 후속 audit로 시작했습니다.
- 정적 audit 결과, `alert rules` 적용 상태를 다시 확인해야 하는 경우에 sticky 저장 설명이 `저장할 수 있지만`으로 읽혀 실제 비활성 저장 버튼 상태와 어긋나는 지점 1건이 남아 있었습니다.
- 현재 브랜치가 `pr37-planning-v3-txn-overrides`이지만, 이번 후속은 이미 같은 dirty worktree 안에 있던 `news/settings` 저장/적용 의미 축의 정밀 보정이라 같은 브랜치에서 계속 처리했습니다.

## 핵심 변경
- `alertRulesStateKnown=false`이면서 메인 저장 대상 dirty가 없는 경우의 메인 상태 문구를 `현재 저장 전 변경이 없음 + 알림 규칙 적용 상태 재확인 필요`로 바꿨습니다.
- sticky 상세 설명도 같은 조건에서 `저장할 수 있지만` 표현을 제거하고, 메인 저장 대상에는 변경이 없으며 알림 규칙만 다시 불러와 확인해야 한다는 뜻으로 맞췄습니다.
- 메인 저장, 내 상황 프로필, 알림 규칙 적용을 다시 뒤섞지 않도록 API 계약, exposure/profile, e2e 흐름은 건드리지 않았습니다.
- `tests/planning-v3-news-settings-ui.test.tsx`의 helper 기대값만 현재 문구 기준으로 갱신했습니다.

## 검증
- `pnpm exec vitest run tests/planning-v3-news-settings-ui.test.tsx tests/planning-v3-news-alerts-ui.test.tsx`
  - PASS
- `pnpm exec eslint src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-settings-ui.test.tsx`
  - PASS
- `pnpm build`
  - PASS
- `git diff --check -- src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-settings-ui.test.tsx work/3/13/2026-03-13-planning-v3-news-settings-section-status-audit.md`
  - PASS

## 미실행 검증
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/news-settings-alert-rules.spec.ts --workers=1`
  - 미실행. 이번 라운드는 `alert rules` load-error 분기에서의 helper 문구 2곳과 unit test 기대값만 조정했고, 버튼 활성 조건, route, follow-through 링크, success notice 흐름 자체는 바꾸지 않았습니다.

## 남은 리스크
- 이번 audit 범위 안에서는 추가 오해 지점을 더 찾지 못했지만, `news/settings` 파일 자체가 여전히 크고 다른 dirty 축과 인접해 있어 후속 수정 때 다시 의미가 섞일 가능성은 있습니다.
- `exposure/profile` 섹션에 별도 local status 줄은 없지만, 현재는 메인 저장 버튼, 저장 시각, sticky 설명만으로 저장/적용 의미를 구분할 수 있다고 판단했습니다.

## 다음 라운드
- `news/settings` 후속은 실제 runtime QA나 사용자 피드백에서 새 오해 사례가 확인될 때만 다시 연다.
- 다음 작업은 별도 배치로 옮기고, `transactions/accounts`나 다른 `planning-v3` 덩어리로는 확장하지 않는다.
