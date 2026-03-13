# 2026-03-12 planning-v3 news data-root isolation closeout

## 변경 파일
- `planning/v3/news/rootDir.ts`
- `planning/v3/news/settings.ts`
- `planning/v3/news/notes.ts`
- `planning/v3/news/weeklyPlan.ts`
- `tests/planning-v3-news-api.test.ts`
- `tests/planning-v3-news-settings-remote-host-api.test.ts`
- `tests/planning-v3-news-notes-api.test.ts`
- `tests/planning-v3-news-weekly-plan-api.test.ts`

## 사용 skill
- `planning-gate-selector`: 이번 라운드를 `planning-v3 news/settings user-facing GET remote-host 계약 + news data root isolation` 배치로 좁히고, 관련 `vitest + eslint + build + guard`만 실행하도록 검증 범위를 고르는 데 사용
- `work-log-closeout`: 실제로 확인된 실패 모드, 수정 범위, 실행한 검증만 `/work` 형식으로 정리하는 데 사용

## 변경 이유
- 최신 `planning-v3 accounts/profile remote-host` closeout 이후 남아 있던 최소 실제 공백은 `/planning/v3/news/settings` 화면이 직접 읽는 `GET /api/planning/v3/news/settings`, `GET /api/planning/v3/news/sources`, `GET /api/planning/v3/indicators/specs`의 same-origin remote-host 계약이 별도 회귀로 고정돼 있지 않은 점이었습니다.
- 이 계약을 확인하려고 `tests/planning-v3-news-api.test.ts`를 재실행하는 과정에서 repo `.data/news/news.sqlite`를 직접 만지며 `corrupted db detected` 복구 로그가 나왔고, `planning/v3/news/settings|notes|weeklyPlan`의 기본 저장 루트가 env 기반 data dir을 무시한다는 test/runtime isolation 리스크가 같이 드러났습니다.

## 핵심 변경
- `tests/planning-v3-news-settings-remote-host-api.test.ts`를 추가해 `news/settings`, `news/sources`, `indicators/specs`가 same-origin remote host에서는 200을 유지하고 cross-origin은 `ORIGIN_MISMATCH`로 막히는지 고정했습니다.
- `planning/v3/news/rootDir.ts`를 추가하고 `planning/v3/news/settings.ts`, `planning/v3/news/notes.ts`, `planning/v3/news/weeklyPlan.ts`의 기본 저장 루트를 `process.cwd()/.data/news` 고정값 대신 env-aware `resolveDataDir` 기반으로 바꿨습니다.
- `tests/planning-v3-news-api.test.ts`, `tests/planning-v3-news-notes-api.test.ts`, `tests/planning-v3-news-weekly-plan-api.test.ts`는 top-level 고정 경로 상수 대신 lazy path 해석 + temp `PLANNING_DATA_DIR`를 쓰도록 바꿔 repo `.data/news`를 건드리지 않게 했습니다.
- 이번 재실행에서는 기존처럼 `news.sqlite.corrupt.*` 복구 stderr가 다시 나오지 않았고, 관련 route/store 테스트가 전부 temp data dir 기준으로 PASS했습니다.

## 검증
- `pnpm test tests/planning-v3-news-settings-remote-host-api.test.ts`
  - PASS
- `pnpm exec eslint tests/planning-v3-news-settings-remote-host-api.test.ts`
  - PASS
- `pnpm test tests/planning-v3-news-settings-remote-host-api.test.ts tests/planning-v3-news-api.test.ts`
  - PASS
  - 이전 코드 상태에서는 `tests/planning-v3-news-api.test.ts` 실행 중 repo `.data/news/news.sqlite`를 건드리며 `corrupted db detected` stderr가 한 번 관찰됨
- `pnpm test tests/planning-v3-news-api.test.ts tests/planning-v3-news-settings-remote-host-api.test.ts tests/planning-v3-news-notes-api.test.ts tests/planning-v3-news-weekly-plan-api.test.ts planning/v3/news/settings.test.ts planning/v3/news/weeklyPlan.test.ts`
  - PASS
  - 수정 후 재실행에서는 관련 stderr 재발 없음
- `pnpm exec eslint planning/v3/news/rootDir.ts planning/v3/news/settings.ts planning/v3/news/notes.ts planning/v3/news/weeklyPlan.ts tests/planning-v3-news-api.test.ts tests/planning-v3-news-settings-remote-host-api.test.ts tests/planning-v3-news-notes-api.test.ts tests/planning-v3-news-weekly-plan-api.test.ts`
  - PASS
- `pnpm build`
  - PASS
  - active dev runtime이 있어 `.next-build` 격리 모드로 실행
- `git diff --check -- planning/v3/news/rootDir.ts planning/v3/news/settings.ts planning/v3/news/notes.ts planning/v3/news/weeklyPlan.ts tests/planning-v3-news-api.test.ts tests/planning-v3-news-settings-remote-host-api.test.ts tests/planning-v3-news-notes-api.test.ts tests/planning-v3-news-weekly-plan-api.test.ts`
  - PASS
- `pnpm multi-agent:guard`
  - PASS

## 남은 리스크
- 이번 라운드 범위의 `planning-v3 news/settings remote-host 계약`과 `news data-root isolation` blocker는 없습니다.
- `planning-v3` 큰 dirty bucket은 여전히 남아 있으므로 다음 라운드는 `transactions/accounts`, `draft/profile`, `news/indicators`처럼 기능축을 더 잘게 나눠 닫는 쪽이 우선입니다.
- `multi-agent:guard`의 `latestWorkNote`는 tracked note 기준이라 이번 untracked closeout은 바로 반영되지 않았습니다. 현재 guard 자체는 PASS이므로 운영상 blocker는 아닙니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
