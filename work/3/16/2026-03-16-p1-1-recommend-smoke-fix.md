# 2026-03-16 P1-1 recommend smoke fix

## 이번 배치 대상 항목 ID
- `P1-1`

## 변경 파일
- `src/app/recommend/page.tsx`
- `work/3/16/2026-03-16-p1-1-recommend-smoke-fix.md`

## 핵심 변경
- recommend 첫 렌더 실패를 좁게 재현한 결과, 실제 원인은 `recommend-root`와 `recommend-submit` stable test id 부재였다.
- recommend page의 본문 래퍼에 `data-testid="recommend-root"`를 추가했다.
- 추천 실행 CTA에 `data-testid="recommend-submit"`를 추가했다.
- 이번 라운드에서는 copy나 추천 로직은 건드리지 않았고, 첫 렌더 smoke selector만 복구했다.
- `/api/sources/status` 500은 `DataFreshnessBanner`가 오류 배너로 처리하며, recommend root/submit 렌더 자체를 막지 않는 것으로 판정했다.

## 실행한 검증
- `git diff -- src/app/recommend/page.tsx`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/smoke.spec.ts --grep "recommend page renders" --workers=1`
- `pnpm build`
- `git diff --check -- src/app/recommend/page.tsx work/3/16/2026-03-16-p1-1-recommend-smoke-fix.md`

## 남은 리스크
- `P1-1` 전체 blocker는 아직 남아 있다. 이번 배치는 recommend smoke selector 1건만 줄인 것이다.
- `/api/sources/status` 500의 근본 원인은 이번 범위에서 다루지 않았다. 현재 근거로는 첫 렌더 blocker가 아니므로 별도 data-source 배치가 맞다.
- recommend 결과 저장, 히스토리, 실제 추천 응답 품질까지는 이번 라운드에서 재검증하지 않았다.

## 다음 우선순위
- `data-sources-settings` copy drift를 `P1-1` 잔여 이슈로 계속 볼지, 별도 운영/copy 배치로 분리할지 결정
- 그 다음 후보로 `news settings` 또는 `DART` selector drift를 각각 1건씩 쪼개 검토

## 사용한 skill
- `planning-gate-selector`: smoke 1건 재현과 build 1회만으로 검증 범위를 좁히는 데 사용.
- `work-log-closeout`: 이번 후속 1건의 변경 파일, 검증, 남은 리스크를 `/work` 형식으로 남기는 데 사용.
