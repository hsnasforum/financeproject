# 2026-03-14 planning-v3 alerts-store-root-contract

## 변경 파일
- 코드 추가 수정 없음
- close 범위로 확인한 dirty subset
  - `planning/v3/alerts/rootDir.ts`
  - `planning/v3/alerts/store.ts`
  - `planning/v3/alerts/store.test.ts`
- `work/3/14/2026-03-14-planning-v3-alerts-store-root-contract.md`

## 사용 skill
- `planning-gate-selector`: 이번 배치를 `internal root/store/test` 축으로 분류하고 `vitest -> eslint -> diff check`만 실행하도록 잠그는 데 사용
- `work-log-closeout`: 이번 close 결과와 다음 우선순위를 `/work` 형식으로 남기는 데 사용

## 변경 이유
- latest note `work/3/13/2026-03-13-planning-v3-post-news-residue-rescan-next-batch-split.md`가 다음 실제 구현 1순위로 `alerts store/root contract`를 추천했다.
- `planning/v3/alerts/{rootDir,store,store.test}.ts`는 pure non-news 기준 가장 작은 internal subset이고, route/page를 다시 열지 않고도 env-aware root와 alert persistence 계약만으로 닫을 수 있었다.
- 이미 닫힌 news 하위 배치와 indicators/accounts/draft/import/runtime 축은 이번 라운드에서 다시 열지 않았다.

## 핵심 변경
- audit 결과, 이번 batch 범위의 dirty diff는 이미 목적과 맞게 정렬돼 있었고 추가 코드 수정은 필요하지 않았다.
- `planning/v3/alerts/rootDir.ts`는 `resolveDataDir({ cwd })` 기반으로 alerts root를 계산해 `PLANNING_DATA_DIR`와 runtime data dir 정책을 그대로 따르고 있었다.
- `planning/v3/alerts/store.ts`는 hard-coded default root 대신 `defaultRootDir() -> resolveAlertsRootDir()` call-time default를 사용해 explicit `rootDir`가 없을 때도 env-aware default root를 일관되게 적용했다.
- `planning/v3/alerts/store.test.ts`는 `PLANNING_DATA_DIR`를 테스트 중 설정한 뒤 `appendAlertEvents`, `resolveAlertEventsPath`, `readAlertEvents`가 모두 같은 기본 root를 따라가는 계약을 직접 고정하고 있었다.
- 조건부 추가 파일은 `src/lib/planning/storage/dataDir.ts`만 열었고, `planning/v3/security/whitelist.ts`는 열지 않았다.

## 검증
- 기준선 / audit
  - `ls -1 work/3/14 2>/dev/null | tail -n 5`
  - `sed -n '1,260p' work/3/13/2026-03-13-planning-v3-post-news-residue-rescan-next-batch-split.md`
  - `git branch --show-current`
  - `git status --short -- planning/v3/alerts/rootDir.ts planning/v3/alerts/store.ts planning/v3/alerts/store.test.ts`
  - `git diff -- planning/v3/alerts/rootDir.ts planning/v3/alerts/store.ts planning/v3/alerts/store.test.ts`
  - `sed -n '1,200p' planning/v3/alerts/rootDir.ts`
  - `sed -n '1,260p' planning/v3/alerts/store.ts`
  - `sed -n '1,260p' planning/v3/alerts/store.test.ts`
  - `sed -n '1,220p' src/lib/planning/storage/dataDir.ts`
- 실행한 검증
  - `pnpm exec vitest run planning/v3/alerts/store.test.ts`
  - PASS (`1 file`, `2 tests`)
  - `pnpm exec eslint planning/v3/alerts/rootDir.ts planning/v3/alerts/store.ts planning/v3/alerts/store.test.ts`
  - PASS
- 미실행 검증
  - `pnpm build`
  - `pnpm e2e:rc`
  - `pnpm release:verify`
  - 전체 `pnpm test`
  - 전체 `pnpm lint`

## 남은 리스크
- 이번 라운드는 `alerts root/store/test`만 닫았으므로, `src/app/api/planning/v3/news/alerts/**`나 news settings UI를 다시 열면 예전 write-side surface와 쉽게 섞일 수 있다.
- current branch 전체에는 더 큰 non-news route/test dirty cluster가 남아 있어 다음 라운드에서도 subset 잠금이 필요하다.

## 다음 라운드 우선순위
1. `accounts/profile remote-host contract`
2. `draft/profile-drafts route contract`
3. `transactions/batches/import user-facing contract`
