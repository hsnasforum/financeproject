# 2026-03-12 planning-v3 news indicators env root contract closeout

## 변경 파일
- `planning/v3/news/store/index.ts`
- `planning/v3/news/recovery.ts`
- `planning/v3/news/store/store.test.ts`
- `planning/v3/news/recovery.test.ts`
- `planning/v3/indicators/rootDir.ts`
- `planning/v3/indicators/store/index.ts`
- `planning/v3/indicators/specOverrides.ts`
- `planning/v3/indicators/store/store.test.ts`
- `planning/v3/indicators/specOverrides.test.ts`
- `tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts`
- `tests/planning-v3-news-digest-indicator-root.test.ts`
- `tests/planning-v3-indicators-specs-import-api.test.ts`
- `tests/planning-v3-write-route-guards.test.ts`

## 사용 skill
- `planning-gate-selector`: news/indicators 배치에서 필요한 최소 검증을 `vitest + eslint + build + guard`로 고르기 위해 사용
- `work-log-closeout`: 오늘 closeout note 형식을 저장소 규칙에 맞춰 정리하기 위해 사용

## 변경 이유
- `planning-v3 news`의 core store와 `planning-v3 indicators`의 store/spec override 기본 root가 아직 `process.cwd()/.data/*` 고정이라 `PLANNING_DATA_DIR` 격리를 무시하고 있었습니다.
- 이 상태에서는 `news/today`, `news/recovery`, `news/refresh`, `indicators/specs`, `news/digest`가 temp data dir 대신 repo 실데이터를 읽거나 쓰는 회귀가 다시 생길 수 있었습니다.
- 추가로 `news/refresh`, `news/recovery`, `indicators/specs POST`는 same-origin remote-host 계약과 apply persistence 회귀가 별도 테스트로 고정돼 있지 않았습니다.

## 핵심 변경
- `planning/v3/news/store/index.ts`의 default root를 `resolveNewsRootDir()` 기반 동적 기본값으로 바꾸고, `planning/v3/news/recovery.ts`의 write target base root도 같은 기준으로 정렬했습니다.
- `tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts`를 추가해 `news/refresh`, `news/recovery`의 same-origin remote-host 성공, cross-origin `ORIGIN_MISMATCH`, env-aware news root persistence를 고정했습니다.
- `tests/planning-v3-write-route-guards.test.ts` runtime target에 `news.recovery.POST`, `news.refresh.POST`를 추가해 공통 guard 회귀도 닫았습니다.
- `planning/v3/indicators/rootDir.ts`를 추가하고 `planning/v3/indicators/store/index.ts`, `planning/v3/indicators/specOverrides.ts`의 default root를 env-aware 동적 기본값으로 바꿨습니다.
- `tests/planning-v3-indicators-specs-import-api.test.ts`를 추가해 `indicators/specs`의 dry-run/apply, cross-origin 차단, temp indicator root persistence를 고정했습니다.
- `tests/planning-v3-news-digest-indicator-root.test.ts`를 추가해 `news/digest`가 env-aware indicator override root를 실제로 읽고 disabled spec을 `unknownReasonCode=disabled`로 반영하는지 확인했습니다.
- `planning/v3/news/store/store.test.ts`, `planning/v3/news/recovery.test.ts`, `planning/v3/indicators/store/store.test.ts`, `planning/v3/indicators/specOverrides.test.ts`에 `PLANNING_DATA_DIR` 기본 root 회귀를 추가했습니다.
- 사용자 경로, current-screens, 운영 runbook 계약은 바뀌지 않아 문서 업데이트는 하지 않았습니다.

## 검증
- `pnpm test planning/v3/news/store/store.test.ts planning/v3/news/recovery.test.ts tests/planning-v3-news-api.test.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts`
- `pnpm exec eslint planning/v3/news/store/index.ts planning/v3/news/recovery.ts planning/v3/news/store/store.test.ts planning/v3/news/recovery.test.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts`
- `pnpm build`
- `pnpm test planning/v3/indicators/store/store.test.ts planning/v3/indicators/specOverrides.test.ts tests/planning-v3-indicators-specs-import-api.test.ts tests/planning-v3-news-digest-indicator-root.test.ts tests/planning-v3-news-settings-remote-host-api.test.ts`
- `pnpm exec eslint planning/v3/indicators/rootDir.ts planning/v3/indicators/store/index.ts planning/v3/indicators/specOverrides.ts planning/v3/indicators/store/store.test.ts planning/v3/indicators/specOverrides.test.ts tests/planning-v3-indicators-specs-import-api.test.ts tests/planning-v3-news-digest-indicator-root.test.ts`
- `pnpm build`
- `git diff --check -- planning/v3/news/store/index.ts planning/v3/news/recovery.ts planning/v3/news/store/store.test.ts planning/v3/news/recovery.test.ts planning/v3/indicators/rootDir.ts planning/v3/indicators/store/index.ts planning/v3/indicators/specOverrides.ts planning/v3/indicators/store/store.test.ts planning/v3/indicators/specOverrides.test.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts tests/planning-v3-news-digest-indicator-root.test.ts tests/planning-v3-indicators-specs-import-api.test.ts tests/planning-v3-write-route-guards.test.ts work/3/12/2026-03-12-planning-v3-news-indicators-env-root-contract-closeout.md`
- `pnpm multi-agent:guard`
- `pnpm multi-agent:guard`

## 남은 리스크
- 이번 라운드 범위의 `news/indicators env root drift`, `refresh/recovery remote-host`, `indicators/specs apply persistence`, `digest -> indicator override linkage` blocker는 없습니다.
- `multi-agent:guard`의 `latestWorkNote`는 tracked note 기준이라 이번 untracked closeout이 최신 note로 바로 반영되지 않을 수 있습니다. 현재 guard PASS라 운영 blocker는 아닙니다.
- `planning-v3` 큰 dirty bucket 자체는 여전히 남아 있으므로 다음 라운드는 `news/alerts-rules`, `other` 재분류, `multi-agent latestWorkNote` 운영 보조축처럼 더 작은 배치로 계속 닫는 편이 안전합니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
