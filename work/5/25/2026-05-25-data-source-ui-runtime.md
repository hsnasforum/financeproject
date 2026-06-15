# 2026-05-25 data source UI runtime

## 변경 파일
- `src/components/DataSourceImpactCardsClient.tsx`
- `src/components/DataSourcePingButton.tsx`
- `src/components/data/DataFreshnessBanner.tsx`
- `src/lib/sources/datago/kdb.ts`
- `src/lib/sources/status.ts`
- `tests/datago-servicekey.test.ts`
- `tests/data-freshness-banner-copy.test.tsx`
- `tests/e2e/data-sources-settings.spec.ts`
- `tests/sources-status.test.ts`
- `work/5/25/2026-05-25-data-source-ui-runtime.md`

## 사용 skill
- `dart-data-source-hardening`: 데이터 소스 상태 조회 실패, 저장소 미초기화, UI 문구와 사용자 흐름 fallback을 점검했습니다.
- `planning-gate-selector`: UI/runtime 후보에 맞춰 unit tests, eslint, e2e:data-sources, diff check를 선택했습니다.
- `work-log-closeout`: 실제 scope, 검증 결과, 남은 stage/PR 리스크를 기록했습니다.

## 변경 이유
- 데이터 소스 설정 화면은 최근 ping 결과를 session storage에서 읽는데, 첫 렌더 후 refresh가 없어 이미 저장된 ping 결과가 늦게 반영될 수 있었습니다.
- 연결 테스트 버튼은 hydration 전 클릭 가능하면 SSR/클라이언트 상태 차이로 불안정할 수 있었습니다.
- DATAGO 저장소 테이블이 아직 없을 때 상태 API가 깨지지 않고 쉬운 한국어 fallback을 반환해야 합니다.
- KDB upstream endpoint는 `http://` 대신 `https://`를 사용해야 합니다.
- freshness banner 문구는 실제 동작인 세션당 1회 자동 스모크 업데이트와 맞아야 합니다.

## 핵심 변경
- impact cards가 mount 시 session storage의 최근 ping 결과를 한 번 refresh하도록 보강했습니다.
- ping 버튼은 hydration 이후에만 활성화되도록 `useSyncExternalStore` 기반 hydrated 플래그를 추가했습니다.
- DATAGO 상태 조회는 필요한 Prisma 테이블이 없거나 DB/schema 오류가 나도 `lastError`가 포함된 unavailable row를 반환합니다.
- KDB endpoint를 HTTPS로 전환하고 테스트로 고정했습니다.
- data freshness banner copy를 실제 자동 스모크 업데이트 동작에 맞췄습니다.
- data sources e2e는 DART meta block이 없을 때 집계 없음 메시지도 허용하도록 완화했습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git diff -- src/components/DataSourceImpactCardsClient.tsx src/components/DataSourcePingButton.tsx src/components/data/DataFreshnessBanner.tsx src/lib/sources/status.ts src/lib/sources/datago/kdb.ts tests/datago-servicekey.test.ts tests/e2e/data-sources-settings.spec.ts` 실행
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin sed -n '1,240p' tests/sources-status.test.ts` 실행
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin sed -n '1,220p' tests/data-freshness-banner-copy.test.tsx` 실행
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin node scripts/worktree_scope.mjs src/components/DataSourceImpactCardsClient.tsx src/components/DataSourcePingButton.tsx src/components/data/DataFreshnessBanner.tsx src/lib/sources/status.ts src/lib/sources/datago/kdb.ts tests/datago-servicekey.test.ts tests/sources-status.test.ts tests/data-freshness-banner-copy.test.tsx tests/e2e/data-sources-settings.spec.ts` 통과: 전체 227, 범위 내 9, 범위 밖 218
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git diff --check -- src/components/DataSourceImpactCardsClient.tsx src/components/DataSourcePingButton.tsx src/components/data/DataFreshnessBanner.tsx src/lib/sources/status.ts src/lib/sources/datago/kdb.ts tests/datago-servicekey.test.ts tests/sources-status.test.ts tests/data-freshness-banner-copy.test.tsx tests/e2e/data-sources-settings.spec.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/datago-servicekey.test.ts tests/sources-status.test.ts tests/data-freshness-banner-copy.test.tsx` 통과: 3 files, 5 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec eslint src/components/DataSourceImpactCardsClient.tsx src/components/DataSourcePingButton.tsx src/components/data/DataFreshnessBanner.tsx src/lib/sources/status.ts src/lib/sources/datago/kdb.ts tests/datago-servicekey.test.ts tests/sources-status.test.ts tests/data-freshness-banner-copy.test.tsx tests/e2e/data-sources-settings.spec.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin PLAYWRIGHT_REUSE_EXISTING_SERVER=0 NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm e2e:rc:data-sources` 통과: 1 passed

## 남은 리스크
- 이 후보 10개 파일은 현재 staged 상태이며, staged diff check와 multi-agent 가드를 통과했습니다.
- `SnapshotDeltaCards.tsx`, `OpenDartStatusCard.tsx`, `CspSafeProgressBar.tsx`는 이번 후보 밖이며 CSP/style 후보로 별도 검증해야 합니다.
- 전체 dirty worktree에는 여전히 218개 이상의 범위 밖 변경이 남아 있어 전체 stage는 위험합니다.

## 다음 라운드
- 이 10개 파일을 독립 커밋으로 분리한 뒤 stage를 다시 비웁니다.
- 다음 후보는 CSP/style runtime 또는 standalone runtime assets 중 범위가 더 좁은 쪽부터 stage 가능성을 확인합니다.
