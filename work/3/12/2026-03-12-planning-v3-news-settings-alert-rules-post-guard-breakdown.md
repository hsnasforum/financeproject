# 2026-03-12 planning-v3 news settings alert rules post-guard breakdown

## 변경 파일
- 코드 수정 없음
- `work/3/12/2026-03-12-planning-v3-news-settings-alert-rules-post-guard-breakdown.md`

## 사용 skill
- `planning-gate-selector`: destructive guard 이후 남은 배치별 검증 범위와 메인 단독 최종 게이트를 다시 고르기 위해 사용
- `work-log-closeout`: 이번 분해 라운드 결과를 다음 작업자가 바로 이어받을 수 있게 `/work` 형식으로 남기기 위해 사용

## 변경 이유
- 최신 closeout이 `planning-v3 news settings destructive guard`까지 닫힌 상태라, 이제 남은 것은 실제 기능 공백과 검증 공백을 다시 좁히는 일입니다.
- 현재 구현을 다시 읽어보면 mixed-dirty overwrite와 load-failure empty apply는 막혔지만, 비전문가용 alert rules 조정 표면과 실제 상호작용 회귀 고정은 아직 남아 있습니다.
- 이번 라운드 목표는 메인 에이전트가 바로 착수할 최소 배치 1개를 고르고, 나머지를 3~5단계 follow-up으로 정리하는 일이었습니다.

## 핵심 변경
- `NewsSettingsClient`의 빠른 조정 표면이 `level`, `minBurstLevel`, `minTodayCount`, `condition`, `window`, `threshold`까지만 다루고 있어 `topicId`, `seriesId`, `metric`, `targetType`, `targetId`는 여전히 JSON-only임을 현재 코드 기준으로 재확인했습니다.
- 기본 규칙 파일과 alert rule schema에는 위 필드들이 실제로 쓰이고 있어, 비전문가가 규칙 대상을 바꾸거나 재지정하려면 아직 raw JSON 편집이 필요합니다.
- `writeAlertRuleOverrides()`는 이미 `updatedAt`을 저장하지만 `news/alerts/rules` API와 설정 화면은 이를 노출하지 않아 적용 완료가 일시 메시지에만 남는 상태임을 확인했습니다.
- 현재 테스트는 static/helper 중심이며, save/apply/reload/retry를 실제 상호작용으로 고정하는 회귀가 아직 없습니다.
- 즉시 처리 1순위는 route 계약을 크게 건드리지 않는 범위에서 `alert rules` 고급 필드 guided input 2차를 추가하는 최소 배치로 정리했습니다.

## 검증
- `sed -n '1,240p' work/3/12/2026-03-12-planning-v3-news-settings-destructive-guard-closeout.md`
- `sed -n '1,240p' work/3/12/2026-03-12-planning-v3-news-alert-rules-risk-breakdown.md`
- `sed -n '1,240p' work/3/12/2026-03-12-planning-v3-news-alert-rules-followup-batch-plan.md`
- `sed -n '1,240p' work/3/12/2026-03-12-planning-v3-news-settings-alert-rules-ui-closeout.md`
- `sed -n '1,220p' .codex/skills/planning-gate-selector/SKILL.md`
- `sed -n '1,240p' .codex/skills/work-log-closeout/SKILL.md`
- `sed -n '1,260p' multi_agent.md`
- `rg -n "alertRules|settingsDirty|alertRulesDirty|handleSave|handleApplyAlertRules|loadAlertRules|현재값 불러오기|적용|내보내기|내 상황 프로필" src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx -S`
- `nl -ba src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx | sed -n '560,980p'`
- `nl -ba src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx | sed -n '1120,1550p'`
- `nl -ba src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx | sed -n '1540,1768p'`
- `nl -ba src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx | sed -n '1780,2075p'`
- `nl -ba src/app/api/planning/v3/news/alerts/rules/route.ts | sed -n '1,280p'`
- `nl -ba src/lib/news/alerts.ts | sed -n '1,120p'`
- `nl -ba src/lib/news/alerts.ts | sed -n '340,430p'`
- `nl -ba config/news-alert-rules.json | sed -n '1,260p'`
- `nl -ba tests/planning-v3-news-settings-ui.test.tsx | sed -n '1,360p'`
- `nl -ba tests/planning-v3-news-alerts-ui.test.tsx | sed -n '1,220p'`
- `rg --files tests e2e | rg 'planning-v3.*news|news-settings|news-alert'`
- `git status --short`

## 남은 리스크
- `topicId`, `seriesId`, `metric`, `targetType`, `targetId`는 실제 schema/config에 쓰이지만 설정 화면 빠른 조정에서는 아직 수정할 수 없습니다.
- `alert rules` apply 성공 여부는 현재 session summary에만 남아 있어, 재진입 시 마지막 적용 시점을 바로 확인하기 어렵습니다.
- mixed-dirty destructive path는 닫혔지만, 이를 실제 DOM 상호작용으로 고정하는 테스트가 부족해 향후 UI 확장에서 회귀 가능성이 남아 있습니다.
- 최종 `pnpm build`, `pnpm e2e:rc`와 shared Next 상태 정리는 메인 에이전트 단독 실행이 필요하며, 이번 라운드에서는 아직 수행하지 않았습니다.

## 이번 라운드 완료 항목
1. destructive guard 이후 남은 실제 기능 공백과 검증 공백을 다시 분리
2. 메인 에이전트 즉시 처리 1순위를 `alert rules` guided input 2차로 고정
3. 메인 단독 최종 게이트와 병렬 가능한 조사/테스트 준비 작업의 경계를 재정리

## 다음 라운드 우선순위
1. `NewsSettingsClient`에서 JSON-only 고급 필드 일부를 guided input으로 승격하는 최소 UI 배치
2. `updatedAt` 노출, parse-error apply disable, 되돌리기 affordance 같은 적용 상태 명확화
3. 메인 단독 `pnpm build`, 좁은 `pnpm e2e:rc` 전용 시나리오로 save/apply/reload 흐름 회귀 고정
