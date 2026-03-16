# 2026-03-16 P1-1 news settings fix

## 이번 배치 대상 항목 ID
- `P1-1`

## 변경 파일
- `src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`
- `work/3/16/2026-03-16-p1-1-news-settings-fix.md`

## 핵심 변경
- `news-settings-alert-rules` 실패를 좁게 재현한 결과, `NewsSettingsClient` 안의 heading, 저장 버튼, 알림 규칙 follow-through 문구가 spec 기대와 어긋나 있었다.
- 상단 타이틀을 `뉴스 기준 설정`으로, 저장 버튼을 `뉴스 기준/내 상황 저장`으로 맞췄다.
- 알림 규칙 섹션의 버튼과 링크 문구를 `현재 적용값 불러오기`, `알림 규칙 적용`, `적용 뒤 결과 확인`, `알림함 확인`, `Digest 확인`으로 정리했다.
- 알림 규칙 안내 문구를 `#news-settings-alert-rules` details 안에 직접 노출해 section 기준 기대값을 맞췄다.
- 좁은 e2e는 settings 문구 drift를 지난 뒤 `/planning/v3/news/alerts` heading `중요 알림함` vs spec 기대 `중요 알림` mismatch에서 멈췄고, 이번 라운드에서는 downstream alerts surface로 확장하지 않았다.

## 검증
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/news-settings-alert-rules.spec.ts --workers=1`
- `pnpm build`
- `git diff --check -- src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx work/3/16/2026-03-16-p1-1-news-settings-fix.md`

## 남은 리스크
- `P1-1`은 아직 `[진행중]`이다. 이번 배치는 `NewsSettingsClient` 내부 drift만 줄였고, downstream alerts page heading mismatch는 남아 있다.
- `/planning/v3/news/alerts`의 hero title이 현재 `중요 알림함`이라 좁은 spec 마지막 단계가 계속 실패한다.
- 알림 규칙 저장 로직, digest/alerts 데이터 로직, API route는 이번 범위에서 검증하거나 수정하지 않았다.

## 다음 우선순위
- `/planning/v3/news/alerts` heading mismatch를 별도 1건으로 분리해 `중요 알림` 기대와 실제 UI 기준을 맞출지 결정
- 또는 `DART` selector drift를 다음 `P1-1` 후속 1건으로 분리

## 사용한 skill
- `planning-gate-selector`: news settings e2e 1건과 build 1회만으로 검증 범위를 좁히는 데 사용.
- `work-log-closeout`: 이번 후속 1건의 변경 파일, 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용.
