# 2026-03-13 planning-v3 news-indicators-residue-rescan-next-batch-split

## 변경 파일
- 코드 수정 없음
- `work/3/13/2026-03-13-planning-v3-news-indicators-residue-rescan-next-batch-split.md`

## 사용 skill
- `planning-gate-selector`: residue 후보별 최소 검증 세트를 다시 좁히는 데 사용
- `work-log-closeout`: 이번 residue 재분해 결과와 다음 1축 추천을 `/work` 형식으로 남기는 데 사용

## 변경 이유
- current branch `pr37-planning-v3-txn-overrides`의 이름과 남은 `news/indicators` dirty cluster가 어긋나므로, 이번 라운드는 구현이 아니라 residue 재분해와 다음 1축 추천으로만 제한했다.
- latest `news write/settings direct UI regression coverage` note가 남긴 다음 우선순위는 `[가정] news/indicators residue 재스캔 후 남은 표면을 다시 1축씩 분해`였다.
- 현재 worktree에는 `planning/v3/alerts`, `planning/v3/indicators`, `planning/v3/news`, `src/app/api/planning/v3/news`, `src/app/planning/v3/news`, `tests/planning-v3-news-*`, `tests/planning-v3-indicators-*` 기준으로 총 `66 files`의 dirty가 남아 있다.
- 이 `66 files`를 그대로 다음 구현 배치로 열면 이미 검증으로 닫은 read-only, write/settings, indicators contract까지 다시 섞일 가능성이 크므로, 경계 재잠금이 먼저 필요했다.

## 현재 residue 현황
- 이미 검증으로 잠겨 다시 열지 않을 축
  - `alerts/settings closed surface`: `16 files`
    - `planning/v3/alerts/rootDir.ts`
    - `planning/v3/alerts/store.ts`
    - `planning/v3/alerts/store.test.ts`
    - `planning/v3/news/settings.ts`
    - `planning/v3/news/settings.test.ts`
    - `src/app/api/planning/v3/news/alerts/route.ts`
    - `src/app/api/planning/v3/news/alerts/rules/route.ts`
    - `src/app/api/planning/v3/news/settings/route.ts`
    - `src/app/planning/v3/news/_components/NewsAlertsClient.tsx`
    - `src/app/planning/v3/news/alerts/page.tsx`
    - `src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`
    - `tests/planning-v3-news-alerts-api.test.ts`
    - `tests/planning-v3-news-alert-rules-api.test.ts`
    - `tests/planning-v3-news-settings-remote-host-api.test.ts`
    - `tests/planning-v3-news-alerts-ui.test.tsx`
    - `tests/planning-v3-news-settings-ui.test.tsx`
  - `news read-only surface`: `23 files`
  - `indicators connector harness`: `6 files`
  - `indicators specs import/root contract`: `6 files`
- 아직 다음 구현 후보로 다시 분리할 수 있는 tail
  - `news refresh/recovery/internal`: `8 files`
  - `news notes/weekly-plan write contract`: `7 files`

## 후보 배치
### 후보 1. news refresh/recovery/internal tail
- 변경 이유
  - `planning/v3/news/cli/newsRefresh.ts`, `planning/v3/news/recovery.ts`, `planning/v3/news/recovery.test.ts`, `planning/v3/news/rootDir.ts`, `src/app/api/planning/v3/news/recovery/route.ts`, `src/app/api/planning/v3/news/refresh/route.ts`, `tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts`, `tests/planning-v3-news-digest-indicator-root.test.ts`가 같은 internal contract 축으로 묶인다.
  - import-safe main guard, env-aware root, recovery preview/apply, remote-host same-origin contract가 한 흐름으로 설명된다.
- 사용자 영향 여부
  - 내부 계약 중심. user-facing copy보다 refresh/recovery 동작 보전이 핵심이다.
- 최소 검증 세트
  - `pnpm exec vitest run planning/v3/news/recovery.test.ts planning/v3/news/digest.test.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts tests/planning-v3-news-digest-indicator-root.test.ts`
  - `pnpm exec eslint planning/v3/news/cli/newsRefresh.ts planning/v3/news/recovery.ts planning/v3/news/recovery.test.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts tests/planning-v3-news-digest-indicator-root.test.ts`
  - route를 실제 수정하면 `pnpm build`
- 다른 축과 섞이면 위험한 이유
  - read-only surface나 settings/alerts write surface와 섞이면 route/UI 의미 변경처럼 보이기 쉽다.
  - indicators spec/store와 섞으면 rootDir 문제와 import/apply semantics가 한꺼번에 커진다.

### 후보 2. news notes/weekly-plan write contract
- 변경 이유
  - `planning/v3/news/notes.ts`, `planning/v3/news/weeklyPlan.ts`, `src/app/api/planning/v3/news/notes/route.ts`, `src/app/api/planning/v3/news/notes/[noteId]/route.ts`, `src/app/api/planning/v3/news/weekly-plan/route.ts`, `tests/planning-v3-news-notes-api.test.ts`, `tests/planning-v3-news-weekly-plan-api.test.ts`는 notes CRUD와 weekly-plan 저장 contract로 좁게 묶인다.
  - alerts/settings direct UI와 분리하면 write-side payload만 설명할 수 있다.
- 사용자 영향 여부
  - user-facing write contract이지만 settings/alerts UI보다 좁다.
- 최소 검증 세트
  - `pnpm exec vitest run tests/planning-v3-news-notes-api.test.ts tests/planning-v3-news-weekly-plan-api.test.ts`
  - `pnpm exec eslint planning/v3/news/notes.ts planning/v3/news/weeklyPlan.ts src/app/api/planning/v3/news/notes/route.ts src/app/api/planning/v3/news/notes/[noteId]/route.ts src/app/api/planning/v3/news/weekly-plan/route.ts tests/planning-v3-news-notes-api.test.ts tests/planning-v3-news-weekly-plan-api.test.ts`
  - route를 실제 수정하면 `pnpm build`
- 다른 축과 섞이면 위험한 이유
  - alerts/settings 저장 의미와 합치면 write-side 전체가 다시 커진다.
  - refresh/recovery와 섞이면 internal maintenance contract까지 같이 흔들린다.

### 후보 3. indicators connector harness
- 변경 이유
  - `planning/v3/indicators/connectors/{ecos,kosis}.ts`, `fixture.ts`, `ecos.test.ts`, `fred.test.ts`, `kosis.test.ts` 6파일이 가장 작은 internal-only harness 묶음이다.
- 사용자 영향 여부
  - 내부 전용.
- 최소 검증 세트
  - `pnpm exec vitest run planning/v3/indicators/connectors/ecos.test.ts planning/v3/indicators/connectors/fred.test.ts planning/v3/indicators/connectors/kosis.test.ts`
  - `pnpm exec eslint planning/v3/indicators/connectors/ecos.ts planning/v3/indicators/connectors/ecos.test.ts planning/v3/indicators/connectors/fixture.ts planning/v3/indicators/connectors/fred.test.ts planning/v3/indicators/connectors/kosis.ts planning/v3/indicators/connectors/kosis.test.ts`
- 다른 축과 섞이면 위험한 이유
  - specOverrides/store와 붙는 순간 import/apply/root contract로 커진다.
  - news surface와 섞으면 내부 harness 수정이 user-facing change처럼 보인다.
- 현재 판단
  - 이미 `indicators connector harness hardening` closeout으로 한 번 잠겼으므로 이번 residue 재분해에서는 다음 구현 후보에서 제외 유지가 더 안전하다.

### 후보 4. indicators specOverrides/store/root contract
- 변경 이유
  - `planning/v3/indicators/specOverrides.ts`, `planning/v3/indicators/specOverrides.test.ts`, `planning/v3/indicators/store/index.ts`, `planning/v3/indicators/store/store.test.ts`, `planning/v3/indicators/rootDir.ts`, `tests/planning-v3-indicators-specs-import-api.test.ts`가 env-aware root + import/apply semantics로 묶인다.
- 사용자 영향 여부
  - 내부 계약 + 단일 API route 영향.
- 최소 검증 세트
  - `pnpm exec vitest run planning/v3/indicators/specOverrides.test.ts planning/v3/indicators/store/store.test.ts tests/planning-v3-indicators-specs-import-api.test.ts`
  - `pnpm exec eslint planning/v3/indicators/rootDir.ts planning/v3/indicators/specOverrides.ts planning/v3/indicators/specOverrides.test.ts planning/v3/indicators/store/index.ts planning/v3/indicators/store/store.test.ts tests/planning-v3-indicators-specs-import-api.test.ts`
  - route를 실제 수정하면 `pnpm build`
- 다른 축과 섞이면 위험한 이유
  - connectors와 섞으면 import source/harness/root contract가 한꺼번에 커진다.
  - news settings remote-host와 섞이면 cross-domain read/write contract까지 붙는다.
- 현재 판단
  - 이미 `indicators specs import/root contract` closeout으로 한 번 잠겼으므로 이번 residue 재분해에서는 다음 구현 후보에서 제외 유지가 더 안전하다.

### 후보 5. news read-only residue
- 변경 이유
  - `planning/v3/news/digest.test.ts`, `llmAdapter.test.ts`, `scenario.test.ts`, `scenario/qualityGates.test.ts`, `select/score.ts`, `store/index.ts`, `store/store.test.ts`, read-only route 8개, news read-only client/page 6개, direct tests 2개가 한 묶음이다.
- 사용자 영향 여부
  - 명확한 user-facing read-only 표면.
- 최소 검증 세트
  - `pnpm exec vitest run planning/v3/news/digest.test.ts planning/v3/news/llmAdapter.test.ts planning/v3/news/scenario.test.ts planning/v3/news/scenario/qualityGates.test.ts planning/v3/news/store/store.test.ts tests/planning-v3-news-api.test.ts tests/planning-v3-news-search-api.test.ts`
  - `pnpm exec eslint planning/v3/news/select/score.ts planning/v3/news/store/index.ts planning/v3/news/store/store.test.ts src/app/api/planning/v3/news/digest/route.ts src/app/api/planning/v3/news/exposure/route.ts src/app/api/planning/v3/news/items/route.ts src/app/api/planning/v3/news/scenarios/route.ts src/app/api/planning/v3/news/search/route.ts src/app/api/planning/v3/news/sources/route.ts src/app/api/planning/v3/news/today/route.ts src/app/api/planning/v3/news/trends/route.ts src/app/planning/v3/news/_components/NewsDigestClient.tsx src/app/planning/v3/news/_components/NewsExploreClient.tsx src/app/planning/v3/news/_components/NewsTodayClient.tsx src/app/planning/v3/news/_components/NewsTrendsClient.tsx src/app/planning/v3/news/_components/NewsTrendsTableClient.tsx src/app/planning/v3/news/trends/page.tsx tests/planning-v3-news-api.test.ts tests/planning-v3-news-search-api.test.ts`
  - `pnpm build`
- 다른 축과 섞이면 위험한 이유
  - write/settings와 붙으면 same-origin read vs write, empty/help copy, follow-through CTA가 한꺼번에 커진다.
  - refresh/recovery internal과 붙으면 root contract와 user-facing payload가 같이 흔들린다.
- 현재 판단
  - 이미 `news read-only surface follow-up` closeout으로 잠긴 축이므로 이번 residue 재분해에서는 제외 유지가 맞다.

## 추천 다음 구현 배치
- 추천: `news refresh/recovery/internal tail`
- 추천 이유
  - 현재 남은 후보 중 가장 작고 internal-only에 가깝다.
  - `8 files` 정도로 닫을 수 있고, user-facing copy나 settings/alerts surface를 다시 열지 않아도 된다.
  - rollback과 원인 분리 면에서 `news notes/weekly-plan write contract`보다 안전하고, 이미 한 번 closeout된 indicators/read-only/write-settings 축을 다시 여는 것보다 가치가 높다.

## 명시적 제외 범위
- 이미 closeout note로 잠긴 축
  - `alerts/settings closed surface`
  - `news read-only surface`
  - `indicators connector harness`
  - `indicators specs import/root contract`
  - `news write/settings direct UI regression coverage`
- 이번 라운드에서 다시 열지 않을 범위
  - `quickstart/home` 전체
  - `draft/profile/import/csv` 전체
  - `runtime scripts/docs` 전체
  - `planning-v2/reports-ui` 전체
  - 코드 수정
  - `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm release:verify`

## 검증
- 기준선/문맥 확인
  - `sed -n '1,260p' .codex/skills/planning-gate-selector/SKILL.md`
  - `sed -n '1,220p' .codex/skills/work-log-closeout/SKILL.md`
  - `sed -n '1,260p' work/3/13/2026-03-13-planning-v3-news-write-settings-direct-ui-regression-coverage.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-news-indicators-residue-rerun-batch-plan.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-indicators-connector-harness-hardening.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-indicators-specs-import-root-contract.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-news-readonly-surface-followup.md`
- residue 잠금
  - `git status --short -- planning/v3/alerts planning/v3/indicators planning/v3/news src/app/api/planning/v3/news src/app/planning/v3/news tests | rg 'planning-v3-news|planning-v3-indicators|planning/v3/alerts|planning/v3/indicators|planning/v3/news|src/app/api/planning/v3/news|src/app/planning/v3/news'`
  - `git diff --stat -- planning/v3/indicators/connectors planning/v3/indicators/specOverrides.ts planning/v3/indicators/specOverrides.test.ts planning/v3/indicators/store planning/v3/indicators/rootDir.ts planning/v3/news/cli/newsRefresh.ts planning/v3/news/recovery.ts planning/v3/news/recovery.test.ts planning/v3/news/rootDir.ts planning/v3/alerts planning/v3/news/settings.ts planning/v3/news/settings.test.ts planning/v3/news/notes.ts planning/v3/news/weeklyPlan.ts src/app/api/planning/v3/news src/app/planning/v3/news tests/planning-v3-news-*.test.ts tests/planning-v3-indicators-*.test.ts`
  - `bash -lc 'git status --short -- planning/v3/indicators/connectors tests/planning-v3-indicators | wc -l | tr -d \" \"'`
  - `bash -lc 'git status --short -- planning/v3/indicators/specOverrides.ts planning/v3/indicators/specOverrides.test.ts planning/v3/indicators/store planning/v3/indicators/rootDir.ts tests/planning-v3-indicators-specs-import-api.test.ts | wc -l | tr -d \" \"'`
  - `bash -lc 'git status --short -- planning/v3/news/cli/newsRefresh.ts planning/v3/news/recovery.ts planning/v3/news/recovery.test.ts planning/v3/news/rootDir.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts tests/planning-v3-news-digest-indicator-root.test.ts src/app/api/planning/v3/news/recovery/route.ts src/app/api/planning/v3/news/refresh/route.ts | wc -l | tr -d \" \"'`
  - `bash -lc 'git status --short -- planning/v3/news/notes.ts planning/v3/news/weeklyPlan.ts src/app/api/planning/v3/news/notes/route.ts src/app/api/planning/v3/news/notes/[noteId]/route.ts src/app/api/planning/v3/news/weekly-plan/route.ts tests/planning-v3-news-notes-api.test.ts tests/planning-v3-news-weekly-plan-api.test.ts | wc -l | tr -d \" \"'`
  - `bash -lc 'git status --short -- planning/v3/alerts/rootDir.ts planning/v3/alerts/store.ts planning/v3/alerts/store.test.ts planning/v3/news/settings.ts planning/v3/news/settings.test.ts src/app/api/planning/v3/news/alerts/route.ts src/app/api/planning/v3/news/alerts/rules/route.ts src/app/api/planning/v3/news/settings/route.ts src/app/planning/v3/news/_components/NewsAlertsClient.tsx src/app/planning/v3/news/alerts/page.tsx src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-alert-rules-api.test.ts tests/planning-v3-news-settings-remote-host-api.test.ts tests/planning-v3-news-alerts-ui.test.tsx tests/planning-v3-news-settings-ui.test.tsx | wc -l | tr -d \" \"'`
  - `bash -lc 'git status --short -- planning/v3/news/digest.test.ts planning/v3/news/llmAdapter.test.ts planning/v3/news/scenario.test.ts planning/v3/news/scenario/qualityGates.test.ts planning/v3/news/select/score.ts planning/v3/news/store/index.ts planning/v3/news/store/store.test.ts src/app/api/planning/v3/news/digest/route.ts src/app/api/planning/v3/news/exposure/route.ts src/app/api/planning/v3/news/items/route.ts src/app/api/planning/v3/news/scenarios/route.ts src/app/api/planning/v3/news/search/route.ts src/app/api/planning/v3/news/sources/route.ts src/app/api/planning/v3/news/today/route.ts src/app/api/planning/v3/news/trends/route.ts src/app/planning/v3/news/_components/NewsDigestClient.tsx src/app/planning/v3/news/_components/NewsExploreClient.tsx src/app/planning/v3/news/_components/NewsTodayClient.tsx src/app/planning/v3/news/_components/NewsTrendsClient.tsx src/app/planning/v3/news/_components/NewsTrendsTableClient.tsx src/app/planning/v3/news/trends/page.tsx tests/planning-v3-news-api.test.ts tests/planning-v3-news-search-api.test.ts | wc -l | tr -d \" \"'`
  - `sed -n '1,220p' tests/planning-v3-news-alert-rules-api.test.ts`
  - `sed -n '1,220p' tests/planning-v3-news-settings-remote-host-api.test.ts`
  - `sed -n '1,220p' planning/v3/news/rootDir.ts`
  - `sed -n '1,220p' planning/v3/indicators/rootDir.ts`
  - `sed -n '1,220p' planning/v3/alerts/rootDir.ts`
- 실행한 검증
  - `git diff --check -- work/3/13/2026-03-13-planning-v3-news-indicators-residue-rescan-next-batch-split.md`
- 미실행 검증
  - `pnpm test`
  - `pnpm lint`
  - `pnpm build`
  - `pnpm e2e:rc`
  - `pnpm release:verify`

## 남은 리스크
- 현재 worktree에는 이미 검증으로 잠긴 축도 그대로 dirty로 남아 있어서, 다음 구현 라운드에서 경계가 다시 흐려질 수 있다.
- `alerts/settings closed surface`에는 `tests/planning-v3-news-alert-rules-api.test.ts`, `tests/planning-v3-news-settings-remote-host-api.test.ts`, `planning/v3/alerts/rootDir.ts`까지 포함돼 있어, careless reopen 시 write-side 전체가 다시 커진다.
- 이번 라운드는 재분해만 수행했으므로 어떤 후보도 새로 PASS/FAIL 판정을 갱신하지 않았다.

## 이번 라운드 완료 항목
- `news/indicators` residue를 `5개 후보 + 이미 잠긴 명시적 제외 범위`로 다시 정리했다.
- 현재 dirty `66 files`를 다음 구현 후보와 재오픈 금지 축으로 분리했다.
- 다음 실제 구현 1축으로 `news refresh/recovery/internal tail`을 추천하고, 나머지는 명시적으로 제외로 잠갔다.

## 다음 라운드 우선순위
1. `news refresh/recovery/internal tail`
2. `news notes/weekly-plan write contract`
3. [가정] 남은 dirty가 계속 섞여 보이면 closeout note 기준으로 `이미 닫힌 축`과 `미구현 tail`을 다시 분리
