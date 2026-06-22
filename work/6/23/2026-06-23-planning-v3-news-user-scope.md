# 2026-06-23 Planning v3 news user-scope

## 변경 파일
- `planning/v3/news/rootDir.ts`
- `src/lib/news/alerts.ts`
- `src/app/api/planning/v3/news/settings/route.ts`
- `src/app/api/planning/v3/news/alerts/route.ts`
- `src/app/api/planning/v3/news/alerts/rules/route.ts`
- `tests/planning-v3-news-user-scope.test.ts`

## 사용 skill
- `finance-skill-routing`: Finance Project 기본/조건부 skill 적용 범위 확인.
- `planning-gate-selector`: news 설정, 알림, 노트 user-scope 변경의 최소 및 확장 검증 세트 선정.
- `work-log-closeout`: 변경 후 `/work` 종료 기록 형식 확인.

## 변경 이유
- Planning v3 news 개인화 상태가 사용자 경계 밖의 공용 파일에 쌓이면 alice/bob 간 설정, 알림 규칙, 메모 상태가 섞일 수 있습니다.
- Auth/User Scope 고도화 라운드에서 `PLANNING_NAMESPACE_ENABLED=1` 조건의 사용자 소유 상태 분리를 회귀 테스트로 고정했습니다.

## 핵심 변경
- news settings/notes 공통 root를 namespace 활성화 시 `.data/planning/users/{userId}/planning-v3/news`로 전환했습니다.
- alert rule override를 namespace 활성화 시 `.data/planning/users/{userId}/news/alerts/rules.override.json`에 저장하도록 분리했습니다.
- settings, alerts, alert rules 성공 응답에 `meta.userId/authSource`를 포함하도록 whitelist schema를 맞췄습니다.
- `tests/planning-v3-news-user-scope.test.ts`를 추가해 settings, alert rules, alert state, notes의 alice/bob 격리를 검증했습니다.
- alert event feed는 운영 원천 이벤트로 전역 공유하고, 사용자별 ack/hide 상태만 분리하는 계약을 테스트로 명시했습니다.

## 검증
- `pnpm test tests/planning-v3-news-user-scope.test.ts tests/planning-v3-news-settings-remote-host-api.test.ts tests/planning-v3-news-alert-rules-api.test.ts tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-notes-api.test.ts` PASS, 5 files, 14 tests.
- `pnpm planning:user-scope:check` PASS, 12 files, 27 tests.
- `pnpm planning:auth:check` PASS, 25 files, 182 tests.
- `pnpm lint` PASS.
- `pnpm typecheck` PASS.
- `pnpm sec:check` PASS.
- `pnpm planning:ssot:check` PASS, 5 files, 9 tests.
- `pnpm test` PASS, 721 files, 2326 tests.
- `pnpm build` PASS.

## 남은 리스크
- [정책] alert event 원천 feed는 이번 라운드에서 사용자별 파일로 분리하지 않았습니다. 현재 계약은 전역 feed + 사용자별 event state입니다.
- [후속] legacy `.data/news/settings.json`, `.data/news/notes`, `.data/alerts/rules.override.json`의 namespace 승격은 별도 migration/export 라운드에서 다루는 편이 안전합니다.
- [후속] news digest, scenarios, exposure처럼 결과성 데이터가 user-specific 입력을 참조하는 경로는 다음 user-scope 라운드에서 별도 확인이 필요합니다.

## 다음 라운드 우선순위
- Planning v3 news digest/scenarios/exposure 계열의 저장소 입력과 사용자별 상태 경계 확인.
- 브라우저 저장소 44개 파일의 설정/draft/dev unlock/legacy fallback 분류.
- Ops freshness stale snapshot 해소 근거를 strict refresh 또는 source별 smoke로 보강.
