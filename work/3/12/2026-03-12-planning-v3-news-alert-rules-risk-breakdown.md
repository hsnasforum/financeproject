# 2026-03-12 planning-v3 news alert rules risk breakdown

## 변경 파일
- 코드 수정 없음
- `work/3/12/2026-03-12-planning-v3-news-alert-rules-risk-breakdown.md`

## 사용 skill
- `planning-gate-selector`: 남은 배치별 최소 검증과 메인 단독 최종 게이트 범위를 고르기 위해 사용
- `work-log-closeout`: 이번 분해 라운드의 근거와 미실행 검증을 `/work` 형식으로 남기기 위해 사용

## 변경 이유
- 최신 closeout이 `save scope alignment`까지 닫힌 상태라, 그 이후 남아 있는 실제 기능 공백과 리스크를 다시 기능축으로 잘라야 했습니다.
- 문구 정렬은 끝났지만 현재 구현에는 `alert rules` draft가 메인 저장, 내보내기, 로드 실패 경로에서 유실되거나 잘못 덮어써질 수 있는 동작 리스크가 남아 있습니다.
- 이번 라운드 목표는 다음 구현 배치 순서를 고정하고, 메인 에이전트가 바로 처리해야 할 최소 배치를 한 개로 좁히는 일이었습니다.

## 핵심 변경
- 최신 closeout과 현재 `NewsSettingsClient` 구현을 다시 대조해, 문구 mismatch는 닫혔지만 draft 보존과 destructive action guard는 아직 비어 있음을 확인했습니다.
- `handleSave()` 성공 후 `load()`가 다시 실행되면서 저장되지 않은 `alertRulesJson` draft를 서버 상태로 덮어쓸 수 있다는 점을 실제 코드 기준 리스크로 재분류했습니다.
- `alert rules` GET 실패 시 `alertRulesJson`이 `[]`로 초기화되는데도 `적용` 버튼은 그대로 활성이라, 재로드 전에 빈 오버라이드를 POST해 기존 규칙을 지울 수 있는 리스크를 확인했습니다.
- `seriesId`, `metric`, `window`, `condition`, `threshold`, `targetType`, `targetId` 등은 여전히 JSON-only 편집 경로에 남아 있어 비전문가용 조정 표면이 완결되지 않았음을 확인했습니다.
- 최종 게이트는 여전히 메인 단독 `pnpm build`, `pnpm e2e:rc` 소유로 남겨야 하며, 병렬 에이전트는 시나리오 정리와 로그 수집까지만 맡기는 구성이 적절하다고 정리했습니다.

## 검증
- `sed -n '1,220p' work/3/12/2026-03-12-planning-v3-news-settings-save-scope-alignment-closeout.md`
- `sed -n '1,220p' work/3/12/2026-03-12-planning-v3-news-alert-rules-followup-batch-plan.md`
- `sed -n '1,220p' work/3/12/2026-03-12-planning-v3-news-alert-rules-quick-edit-and-load-state-closeout.md`
- `sed -n '1,220p' work/3/12/2026-03-12-planning-v3-news-settings-alert-rules-ui-closeout.md`
- `sed -n '1,220p' .codex/skills/planning-gate-selector/SKILL.md`
- `sed -n '1,220p' .codex/skills/work-log-closeout/SKILL.md`
- `rg -n "settingsDirty|alertRulesDirty|handleSave|handleApplyAlertRules|alert rules|알림 규칙|details" src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx -S`
- `nl -ba src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx | sed -n '560,980p'`
- `nl -ba src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx | sed -n '1120,1545p'`
- `nl -ba src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx | sed -n '1788,2055p'`
- `nl -ba src/app/api/planning/v3/news/alerts/rules/route.ts | sed -n '1,260p'`
- `nl -ba src/app/api/planning/v3/news/settings/route.ts | sed -n '1,260p'`
- `nl -ba src/app/api/planning/v3/exposure/profile/route.ts | sed -n '1,260p'`
- `nl -ba tests/planning-v3-news-settings-ui.test.tsx | sed -n '1,320p'`
- `nl -ba config/news-alert-rules.json | sed -n '1,260p'`

## 남은 리스크
- 메인 저장과 `alert rules` draft를 함께 만진 상태에서 사용자가 `설정 저장`을 누르면, 현재 구현은 `alert rules` draft를 저장하지 않은 채 다시 불러오기로 덮어쓸 수 있습니다.
- `alert rules` 초기 로드 실패 뒤 `적용` 버튼이 살아 있어, 실제 서버 규칙을 확인하지 못한 상태에서도 빈 오버라이드를 저장할 수 있습니다.
- 고급 필드는 JSON-only라 비전문가용 조정이 아직 제한적입니다.
- 사용자 플로우 회귀는 static/helper/API 테스트 위주라서, 최종 메인 단독 `pnpm e2e:rc` 전까지는 실제 브라우저 저장/적용/재진입 흐름 리스크가 남아 있습니다.

## 이번 라운드 완료 항목
1. 최신 closeout 이후 남은 실제 기능 공백을 다시 분해
2. 즉시 처리 1순위를 `alert rules` draft 유실 방지로 재고정
3. 메인 단독 최종 검증과 병렬 가능 작업의 경계를 다시 정리

## 다음 라운드 우선순위
1. 메인 에이전트가 `alert rules` draft 유실 방지 최소 배치를 먼저 처리
2. 그 다음 load failure/apply/export guard와 section 상태 문구를 보강
3. 마지막에 고급 필드 UX와 메인 단독 `pnpm build`, `pnpm e2e:rc`를 닫기
