# 2026-03-13 planning-v3 news settings alert rules save semantics closeout

## 변경 파일
- `src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`
- `src/app/api/planning/v3/news/alerts/rules/route.ts`
- `tests/planning-v3-news-settings-ui.test.tsx`
- `tests/e2e/news-settings-alert-rules.spec.ts`
- `work/3/13/2026-03-13-planning-v3-news-settings-alert-rules-save-semantics-closeout.md`

## 사용 skill
- `planning-gate-selector`: `news/settings - alert rules 저장 의미 정렬` 1축에 맞춰 관련 vitest, eslint, build, 좁은 e2e만 실행하도록 검증 세트를 고르기 위해 사용
- `work-log-closeout`: 실제 포함 파일, 실행한 검증, 남은 리스크, 다음 라운드를 `/work` 형식으로 남기기 위해 사용

## 변경 이유
- `NewsSettingsClient`에서 메인 저장 버튼과 `alert rules` 적용 버튼이 이미 분리돼 있었지만, 사용자 입장에서는 여전히 화면 전체 저장처럼 읽히는 문구와 버튼 상태가 남아 있었습니다.
- 특히 `alert rules`는 마지막 적용 시점이 화면에 드러나지 않고, 변경이 없어도 다시 적용할 수 있어 `저장`과 `적용` 의미가 흐려질 수 있었습니다.
- 현재 브랜치가 `pr37-planning-v3-txn-overrides`이지만, 이번 작업은 이미 같은 dirty worktree 안에 남아 있던 `planning-v3 news/settings` 하위축만 닫는 편이 더 안전하다고 판단해 같은 브랜치에서 이어갔습니다.

## 핵심 변경
- 메인 저장 상태 문구를 `뉴스 기준/내 상황 저장` 기준으로 다시 맞추고, `alert rules` 상태를 `메인 저장에 포함되지 않는 별도 적용`으로 더 보수적으로 안내하도록 정리했습니다.
- `alert rules` API 응답에 `updatedAt`을 노출하고, 설정 화면에 마지막 적용 시각을 함께 보여 주도록 바꿨습니다.
- `alert rules` 섹션의 `현재 적용값 불러오기` / `적용값 다시 불러오기` / `알림 규칙 적용` 문구를 정리하고, 변경이 없거나 load error/JSON error가 있으면 적용 버튼이 비활성되도록 맞췄습니다.
- `alert rules` 적용 성공 시 전역 notice도 `메인 저장과 별도 반영` 의미로 맞췄고, 메인 저장 성공 notice도 같은 기준으로 보정했습니다.
- `exposure/profile`, `news/settings route`, `planning-v3 news settings/alerts` re-export 파일은 이번 배치에 포함하지 않았습니다.

## 검증
- `pnpm exec vitest run tests/planning-v3-news-settings-ui.test.tsx tests/planning-v3-news-alerts-ui.test.tsx tests/planning-v3-news-alert-rules-api.test.ts tests/planning-v3-news-settings-remote-host-api.test.ts`
  - PASS
- `pnpm exec eslint src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx src/app/api/planning/v3/news/alerts/rules/route.ts tests/planning-v3-news-settings-ui.test.tsx tests/planning-v3-news-alerts-ui.test.tsx tests/planning-v3-news-alert-rules-api.test.ts tests/planning-v3-news-settings-remote-host-api.test.ts tests/e2e/news-settings-alert-rules.spec.ts`
  - PASS
- `pnpm build`
  - PASS
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/news-settings-alert-rules.spec.ts --workers=1`
  - PASS
- `git diff --check -- src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx src/app/api/planning/v3/news/alerts/rules/route.ts tests/planning-v3-news-settings-ui.test.tsx tests/e2e/news-settings-alert-rules.spec.ts`
  - PASS
- `git diff --no-index --check /dev/null tests/planning-v3-news-settings-ui.test.tsx`
  - 종료코드 `1`, 출력 없음. 신규 파일 diff 자체 때문이며 whitespace 오류 보고는 없었습니다.
- `git diff --no-index --check /dev/null tests/e2e/news-settings-alert-rules.spec.ts`
  - 종료코드 `1`, 출력 없음. 신규 파일 diff 자체 때문이며 whitespace 오류 보고는 없었습니다.

## 미실행 검증
- `pnpm e2e:rc`
  - 미실행. 이번 라운드는 route/href 전체 회귀가 아니라 `news/settings` 저장/적용 의미 정렬 1축만 다뤘고, 전용 e2e 1건으로 범위를 좁혔습니다.

## 남은 리스크
- `alert rules` 상태 안내는 더 명확해졌지만, 여전히 `news/settings` 안에는 `indicators`, `digest`, `search`, `recovery` 등 넓은 dirty 범위가 남아 있습니다. 다음 라운드도 이 축 밖으로 퍼지지 않게 포함 파일을 다시 잠가야 합니다.
- `alert rules` 마지막 적용 시각은 이제 노출되지만, 기본 규칙의 고급 필드 조정 UX 자체는 이번 배치 범위가 아니어서 그대로 남아 있습니다.
- 현재 검증은 전용 vitest + 전용 e2e 1건 + build까지 통과했지만, 이후 같은 파일에 다른 dirty 변경이 겹치면 다시 문구와 버튼 상태가 섞일 수 있습니다.

## 다음 라운드
- 같은 `news/settings` 그룹 안에서만 `section-level dirty/status` 추가 정리가 정말 필요한지 다시 판단
- 필요 시 `alert rules` guided input이나 상태 문구 후속을 별도 최소 배치로 분리
- `transactions/accounts`나 다른 `planning-v3` 덩어리로는 확장하지 않음
