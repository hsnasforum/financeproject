# 2026-03-16 P1-1 dart company fix

## 이번 배치 대상 항목 ID
- `P1-1`

## 변경 파일
- `src/components/DartCompanyPageClient.tsx`
- `work/3/16/2026-03-16-p1-1-dart-company-fix.md`

## 핵심 변경
- `dart-flow`를 company detail 구간만 좁혀 재현한 결과, 첫 blocker는 `dart-company-root` test id 부재였다.
- `DartCompanyPageClient`에 `dart-company-root`, `dart-company-name`, `dart-monitor-action` stable test id를 추가했다.
- 검색 결과에서 상세 화면으로 들어온 경우 뒤로가기 링크 문구를 `검색 결과로 돌아가기`로 맞췄다.
- company detail 진입, 검색 결과 복귀, monitor 탭 이동까지 좁은 `dart-flow` spec이 끝까지 통과했다.
- DART search index 생성, monitor 데이터 로직, favorites/localStorage 동작은 이번 범위에서 수정하지 않았다.

## 검증
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/dart-flow.spec.ts --grep "dart search -> company detail flow" --workers=1`
- `pnpm build`
- `git diff --check -- src/components/DartCompanyPageClient.tsx work/3/16/2026-03-16-p1-1-dart-company-fix.md`

## 남은 리스크
- `P1-1`은 아직 `[진행중]`이다. 이번 라운드는 DART company detail selector/copy drift 1건만 줄였다.
- `DartDisclosureMonitorClient`, `DartSearchClient`, 데이터 인덱스/연동 상태는 이번 범위에서 검증하거나 수정하지 않았다.
- stale hold note 4개는 이번 배치 범위 밖이라 그대로 남겨뒀다.

## 다음 우선순위
- 남은 `P1-1` triage 항목 중 어떤 구간이 실제 closeout gate를 계속 막는지 다시 좁혀 우선순위를 정리
- 필요하면 `P1-1` 후속을 `DART` monitor surface 또는 다른 잔여 selector drift 1건으로 분리

## 사용한 skill
- `planning-gate-selector`: company detail selector drift 1건에 맞춰 좁은 e2e와 build만 실행하도록 검증 범위를 고정하는 데 사용.
- `work-log-closeout`: 이번 후속 1건의 변경 파일, 검증, 남은 리스크를 `/work` 형식으로 남기는 데 사용.
