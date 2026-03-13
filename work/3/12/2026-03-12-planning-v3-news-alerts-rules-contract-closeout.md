# 2026-03-12 planning-v3 news alerts rules contract closeout

## 변경 파일
- `planning/v3/alerts/rootDir.ts`
- `planning/v3/alerts/store.ts`
- `planning/v3/alerts/store.test.ts`
- `tests/planning-v3-news-alerts-api.test.ts`
- `tests/planning-v3-news-alert-rules-api.test.ts`

## 사용 skill
- `planning-gate-selector`: alerts store/helper와 planning-v3 API 계약 배치에서 필요한 최소 검증을 `vitest + eslint + build + guard`로 고르기 위해 사용
- `work-log-closeout`: 오늘 closeout note를 저장소 규칙에 맞춰 정리하기 위해 사용

## 변경 이유
- `planning-v3 news alerts` 테스트가 temp data dir 대신 repo 기본 alerts 경로를 직접 건드릴 수 있어 isolation 회귀 여지가 남아 있었습니다.
- `planning-v3 news alerts/rules`는 same-origin remote-host, cross-origin 차단, override persistence를 고정하는 전용 계약 테스트가 없어 user-facing guard 범위가 비어 있었습니다.
- `planning/v3/alerts/store.ts`의 기본 root도 env-aware가 아니라 direct caller가 생기면 같은 drift가 반복될 수 있었습니다.

## 핵심 변경
- `planning/v3/alerts/rootDir.ts`를 추가하고 `planning/v3/alerts/store.ts`의 기본 root를 `resolveAlertsRootDir()` 기준으로 바꿔 `PLANNING_DATA_DIR`를 따라가도록 정렬했습니다.
- `planning/v3/alerts/store.test.ts`에 env-aware default root 회귀를 추가해 explicit root 인자 없이도 temp alerts root로 쓰는지 고정했습니다.
- `tests/planning-v3-news-alerts-api.test.ts`를 temp root 기반으로 바꾸고 same-origin remote-host POST가 `event-state.json`을 env-aware alerts root에 저장하는지 검증했습니다.
- `tests/planning-v3-news-alert-rules-api.test.ts`를 추가해 `news/alerts/rules`의 same-origin remote-host GET/POST, cross-origin `ORIGIN_MISMATCH`, `rules.override.json` persistence를 고정했습니다.
- `alerts/rules`에 직접 붙은 user-facing UI caller는 이번 스캔에서 찾지 못해 route contract만 좁게 닫고 기능 확장은 하지 않았습니다.
- route/current-screens/runbook 계약은 바뀌지 않아 docs 업데이트는 하지 않았습니다.

## 검증
- `pnpm test planning/v3/alerts/store.test.ts tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-alert-rules-api.test.ts tests/planning-v3-write-route-guards.test.ts`
- `pnpm exec eslint planning/v3/alerts/rootDir.ts planning/v3/alerts/store.ts planning/v3/alerts/store.test.ts tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-alert-rules-api.test.ts`
- `pnpm build`
- `git diff --check -- planning/v3/alerts/rootDir.ts planning/v3/alerts/store.ts planning/v3/alerts/store.test.ts tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-alert-rules-api.test.ts work/3/12/2026-03-12-planning-v3-news-alerts-rules-contract-closeout.md`
- `pnpm multi-agent:guard`

## 남은 리스크
- 이번 배치의 `alerts API isolation`, `alerts/rules remote-host contract`, `alerts store default root drift` blocker는 없습니다.
- `alerts/rules`는 아직 실제 설정 UI caller가 없으므로, 이후 화면이 붙는 배치에서는 이번 계약 테스트 위에 사용자 플로우 테스트를 추가해야 합니다.
- `multi-agent:guard`의 `latestWorkNote`는 tracked note 기준이라 이번 untracked closeout이 최신 note로 바로 반영되지 않을 수 있습니다. 현재 guard PASS면 운영 blocker는 아닙니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
