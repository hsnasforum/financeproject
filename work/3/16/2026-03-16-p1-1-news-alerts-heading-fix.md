# 2026-03-16 P1-1 news alerts heading fix

## 이번 배치 대상 항목 ID
- `P1-1`

## 변경 파일
- `src/app/planning/v3/news/_components/NewsAlertsClient.tsx`
- `work/3/16/2026-03-16-p1-1-news-alerts-heading-fix.md`

## 핵심 변경
- `news-settings-alert-rules` 좁은 spec이 `/planning/v3/news/alerts` 진입 뒤 heading mismatch에서 멈추는 것을 다시 확인했다.
- `/planning/v3/news/alerts` 페이지 진입 자체와 alerts 데이터 로딩은 정상이고, 실제 blocker는 hero title `중요 알림함` vs spec 기대 `중요 알림` 차이 1건이었다.
- `NewsAlertsClient` hero title을 `중요 알림`으로 보정했다.
- 알림 데이터 로직, 필터 로직, 저장 로직, API route는 이번 범위에서 수정하지 않았다.
- 수정 후 동일 spec이 끝까지 통과해 settings → alerts → digest follow-through 흐름을 다시 확인했다.

## 검증
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/news-settings-alert-rules.spec.ts --workers=1`
- `pnpm build`
- `git diff --check -- src/app/planning/v3/news/_components/NewsAlertsClient.tsx work/3/16/2026-03-16-p1-1-news-alerts-heading-fix.md`

## 남은 리스크
- `P1-1`은 아직 `[진행중]`이다. 이번 라운드는 news alerts heading drift 1건만 줄였다.
- `DART` 관련 selector drift 등 다른 triage 항목은 그대로 남아 있다.
- stale hold note 4개는 이번 배치 범위 밖이라 건드리지 않았다.

## 다음 우선순위
- `DART` selector drift를 다음 `P1-1` 후속 1건으로 분리할지 결정
- 또는 `P1-1` 남은 triage 항목을 다시 좁혀 closeout 근거를 더 모을지 판단

## 사용한 skill
- `planning-gate-selector`: news alerts heading drift 1건에 맞춰 좁은 e2e와 build만 실행하도록 검증 범위를 고정하는 데 사용.
- `work-log-closeout`: 이번 후속 1건의 변경 파일, 검증, 남은 리스크를 `/work` 형식으로 남기는 데 사용.
