# 2026-03-12 planning-v3 news alert rules follow-up batch plan

## 변경 파일
- 코드 수정 없음
- `work/3/12/2026-03-12-planning-v3-news-alert-rules-followup-batch-plan.md`

## 사용 skill
- `planning-gate-selector`: 남은 배치를 UI 저장 흐름, 사용자 경로, 검증 게이트 기준으로 다시 자르기 위해 사용
- `work-log-closeout`: 이번 라운드의 분해 근거와 미실행 검증을 `/work` 형식으로 남기기 위해 사용

## 변경 이유
- 최신 closeout 기준으로 `planning-v3 news alert rules`는 `discoverability`, `quick edit`, `load failure 안내`까지 닫혔지만, 후속 배치 우선순위는 아직 한 번 더 기능축 기준으로 잘라야 했습니다.
- 특히 `NewsSettingsClient`는 alert rules draft를 상단/하단 dirty 상태에 포함하지만, 메인 저장 버튼은 `news/settings`와 `exposure/profile`만 저장해 사용자 기대와 실제 persistence가 어긋날 여지가 있었습니다.
- 이번 라운드 목표는 구현이 아니라, 지금 시점의 실제 기능 공백과 검증 공백을 메인 에이전트 단독 소유 기준으로 다시 분해하는 일이었습니다.

## 핵심 변경
- 최신 관련 closeout 네 개(`alerts rules contract`, `settings caller`, `discoverability`, `quick edit + load state`)와 현재 `NewsSettingsClient` 구현을 다시 대조했습니다.
- `dirty` 계산에는 alert rules draft가 포함되지만 `handleSave()`는 `/api/planning/v3/news/settings`, `/api/planning/v3/exposure/profile`만 저장하고 `/api/planning/v3/news/alerts/rules`는 별도 `적용` 버튼으로만 저장된다는 점을 확인했습니다.
- 하단 고정 저장 바 문구가 "뉴스 기준과 내 상황 프로필은 같은 버튼으로 저장"이라고 안내하는 반면, alert rules는 같은 dirty 상태에 묶여 있어 저장 의미가 혼합되는 UX 리스크로 재분류했습니다.
- 현재 테스트는 static render/helper/API contract 중심이며, alert rules 수정 후 저장/적용/재로드의 사용자 플로우 회귀와 section-level 상태 분리는 아직 고정되지 않았음을 확인했습니다.
- 후속 배치는 `저장 의미 정렬 -> section 상태 분리 -> 고급 필드 UX -> 메인 단독 최종 검증` 순으로 제안하기로 정리했습니다.

## 검증
- `sed -n '1,220p' work/3/12/2026-03-12-planning-v3-news-alert-rules-quick-edit-and-load-state-closeout.md`
- `sed -n '1,220p' work/3/12/2026-03-12-planning-v3-news-alert-rules-ux-discoverability-closeout.md`
- `sed -n '1,220p' work/3/12/2026-03-12-planning-v3-news-settings-alert-rules-ui-closeout.md`
- `sed -n '1,220p' work/3/12/2026-03-12-planning-v3-news-alerts-rules-contract-closeout.md`
- `sed -n '1,260p' .codex/skills/planning-gate-selector/SKILL.md`
- `sed -n '1,220p' .codex/skills/work-log-closeout/SKILL.md`
- `sed -n '1,260p' multi_agent.md`
- `rg -n "alertRules|handleApplyAlertRules|설정 저장|dirty" src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests -S`
- `rg --files tests | rg 'news-settings|news-alert|planning-v3.*news'`
- `nl -ba src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx | sed -n '790,980p'`
- `nl -ba src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx | sed -n '1148,1515p'`
- `nl -ba src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx | sed -n '1790,1818p'`
- `nl -ba tests/planning-v3-news-settings-ui.test.tsx | sed -n '1,220p'`
- `nl -ba tests/planning-v3-news-alerts-ui.test.tsx | sed -n '1,120p'`
- `sed -n '1,220p' config/news-alert-rules.json`

## 미실행 검증
- `pnpm test`
  - 미실행. 이번 라운드는 코드 변경 없이 후속 배치 분해가 목적이었습니다.
- `pnpm lint`
  - 미실행. 동일.
- `pnpm build`
  - 미실행. 공유 상태를 쓰는 최종 게이트는 메인 에이전트 단독 소유로 남깁니다.
- `pnpm e2e:rc`
  - 미실행. 동일.

## 남은 리스크
- 메인 저장 버튼과 alert rules `적용` 버튼의 역할이 현재 dirty/문구 기준으로 분리되지 않아, 사용자가 규칙 변경도 같은 저장 버튼에 포함된다고 오해할 수 있습니다.
- alert rules 섹션은 load failure 안내는 추가됐지만, in-flight 로딩과 section-level dirty/saved 상태는 아직 별도 모델이 없어 저장 의미가 섞여 보일 수 있습니다.
- `topicId`, `seriesId`, `metric`, `targetType`, `targetId` 같은 고급 필드는 기본 규칙에서 실제로 쓰이지만 여전히 JSON 보조 경로에 남아 있어 비전문가용 조정 표면은 제한적입니다.
- 최종 `pnpm build`, `pnpm e2e:rc`는 메인 에이전트가 shared Next 상태를 정리한 뒤 단독으로 실행해야 합니다.

## 이번 라운드 완료 항목
1. 최신 closeout과 현재 구현을 다시 대조해 이미 닫힌 범위와 남은 실제 공백을 분리
2. 저장 의미 충돌을 최우선 follow-up 후보로 고정
3. 후속 배치를 3~5단계 순서로 재구성할 근거 확보

## 다음 라운드 우선순위
1. 메인 에이전트가 alert rules 저장 의미와 dirty/status 문구를 먼저 정렬하는 최소 배치를 처리
2. 그 다음 section-level 상태/로딩 분리와 사용자 플로우 회귀 테스트를 좁게 추가
3. 마지막에 고급 필드 UX와 메인 단독 build/e2e 게이트를 이어서 닫기
