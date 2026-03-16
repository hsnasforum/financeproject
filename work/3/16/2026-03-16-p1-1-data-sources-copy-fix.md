# 2026-03-16 P1-1 data-sources copy fix

## 이번 배치 대상 항목 ID
- `P1-1`

## 변경 파일
- `src/components/DataSourceHealthTable.tsx`
- `work/3/16/2026-03-16-p1-1-data-sources-copy-fix.md`

## 핵심 변경
- `data-sources-settings` 실패를 좁게 재현한 결과, `data-source-impact-meta-dart` 블록의 영문 제목 `Health API Aggregation`이 실제 blocker였다.
- 사용자 노출 문구를 `health API 집계`로 바꿔 현재 e2e 기대와 실제 UI를 다시 맞췄다.
- 이번 라운드에서는 `DataSourceHealthTable` 한 줄 copy만 수정했고, data-source contract, freshness 계산, API route는 건드리지 않았다.
- `YES/NO` 등 다른 영문 잔여는 이번 범위에서 건드리지 않았다.

## 실행한 검증
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/data-sources-settings.spec.ts --workers=1`
- `pnpm build`
- `git diff --check -- src/components/DataSourceHealthTable.tsx work/3/16/2026-03-16-p1-1-data-sources-copy-fix.md`

## 남은 리스크
- `P1-1` 전체 blocker는 아직 남아 있다. 이번 배치는 data-sources settings copy drift 1건만 줄인 것이다.
- 테스트 중 `housing:sales` upstream 404 로그는 보였지만, 현재 spec 실패 원인은 아니었고 이번 범위에서도 다루지 않았다.
- 다른 설정 화면의 영문 잔여나 운영 진단 문구는 별도 배치로 다루는 편이 안전하다.

## 다음 우선순위
- `news settings` selector/copy drift를 별도 1건으로 분리할지 검토
- 또는 `DART` selector drift를 별도 1건으로 분리할지 결정

## 사용한 skill
- `planning-gate-selector`: data-sources-settings spec 1건과 build 1회만으로 검증 범위를 좁히는 데 사용.
- `work-log-closeout`: 이번 후속 1건의 변경 파일, 검증, 남은 리스크를 `/work` 형식으로 남기는 데 사용.
