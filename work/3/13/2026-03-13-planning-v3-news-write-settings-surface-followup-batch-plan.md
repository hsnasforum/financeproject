# 2026-03-13 planning-v3 news-write-settings-surface-followup batch plan

## 변경 파일
- 코드 수정 없음
- `work/3/13/2026-03-13-planning-v3-news-write-settings-surface-followup-batch-plan.md`

## 사용 skill
- `work-log-closeout`: 이번 라운드의 범위 고정, 제외 범위, 다음 배치 분해를 저장소 `/work` 형식으로 남기기 위해 사용

## 변경 이유
- 최신 `work/3/13` 기준으로 `news read-only surface`와 `refresh/recovery/newsRefresh` 내부 계약은 이미 별도 배치로 잠겨 있습니다.
- 이번 요청은 `planning-v3 news-write-settings-surface-followup`만 아주 짧게 다시 분해하되, 범위를 `alerts/settings/notes/weekly-plan + 직접 대응 route/test + recovery/refresh/newsRefresh`까지만 제한하라는 것입니다.
- `indicators / read-only news / runtime`으로 다시 넓히지 않도록, 실제 구현 전에 배치 경계를 먼저 고정하는 것이 목적입니다.

## 핵심 변경
- `alerts/settings` 저장 의미와 사용자 문구 정렬을 첫 축으로 둡니다.
- `notes` CRUD와 `weekly-plan` 저장 흐름은 같은 write surface지만 성격이 달라 후속 축으로 분리합니다.
- `refresh/recovery/newsRefresh`는 새 기능 확장이 아니라 write surface 회귀를 막는 직접 대응 contract 축으로만 포함합니다.
- `read-only news`, `indicators`, `runtime`은 이번 배치에서 명시적으로 제외합니다.

## 검증
- 기준선 확인
  - `ls -1t work/3/13 | head -n 12`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-news-settings-section-status-audit.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-news-readonly-surface-followup.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-news-refresh-root-contract-followup.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-single-owner-final-gate-rerun.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-news-indicators-residue-next-batch-breakdown.md`
- 범위 확인
  - `git status --short -- planning/v3/alerts planning/v3/news src/app/api/planning/v3/news src/app/planning/v3/news tests/planning-v3-news-*.test.ts tests/planning-v3-news-*.test.tsx tests/e2e/news-settings-alert-rules.spec.ts`
- 형식 확인
  - `git diff --no-index --check /dev/null work/3/13/2026-03-13-planning-v3-news-write-settings-surface-followup-batch-plan.md`
- 미실행 검증
  - `pnpm test`
  - `pnpm lint`
  - `pnpm build`
  - `pnpm e2e:rc`

## 남은 리스크
- `alerts/settings`와 `notes/weekly-plan`은 둘 다 write surface지만 실패 모드가 달라, 실제 구현에서는 다시 둘로 나누는 편이 안전할 수 있습니다.
- `tests/planning-v3-news-api.test.ts`처럼 read/write 축이 인접한 파일은 이번 배치에서도 경계가 다시 흐려질 수 있습니다.
- `refresh/recovery/newsRefresh`는 이미 별도 closeout이 있지만 dirty 상태는 남아 있어, 다음 구현자가 scope를 느슨하게 잡으면 내부 계약 수정으로 번질 수 있습니다.

## 이번 라운드 완료 항목
- `news-write-settings-surface-followup` 배치를 지정 범위 안에서 다시 자를 기준을 정리했습니다.
- `alerts/settings/notes/weekly-plan + 직접 대응 route/test + recovery/refresh/newsRefresh`만 포함하고, `indicators/read-only news/runtime`은 제외 범위로 고정했습니다.
- 사용자에게 바로 쓸 수 있는 3~5단계 분해안만 남기도록 준비했습니다.

## 다음 라운드
- 우선 `alerts/settings`와 `notes/weekly-plan`의 분리 여부를 다시 한 번 확인한 뒤 실제 구현 배치를 엽니다.
- 구현이 시작되면 그때 직접 대응 route/test와 `refresh/recovery/newsRefresh`를 최소 범위로만 묶어 검증합니다.
