# 2026-03-13 planning-v3 news-route same-origin-contract follow-up

## 변경 파일
- 코드 수정 없음
- `work/3/13/2026-03-13-planning-v3-news-route-same-origin-contract-followup.md`

## 사용 skill
- `planning-gate-selector`: App Router API route contract 축에 맞춰 `vitest + eslint + build + diff check`만 실행하도록 검증 범위를 잠그는 데 사용
- `work-log-closeout`: route source audit 결과와 실행/미실행 검증을 `/work` 형식으로 남기는 데 사용

## 변경 이유
- 직전 `news-refresh root-contract follow-up` note가 logic/test 축은 PASS로 닫혔고, dirty route 파일을 다룰 때는 same-origin contract만 최소 범위로 묶으라고 남겼다.
- 현재 남은 dirty route는 `src/app/api/planning/v3/news/refresh/route.ts`, `src/app/api/planning/v3/news/recovery/route.ts`, `src/app/api/planning/v3/news/digest/route.ts` 3개로, 공통 변화가 `same-origin + CSRF + import path 정리`로 묶이는 작은 축이었다.
- 반면 `csv-parse`와 `drafts-upload-flow`는 `import/csv + drafts + draft preview/save/list` 흐름을 다시 크게 열 가능성이 커서 이번 라운드에서 제외했다.
- 현재 브랜치 `pr37-planning-v3-txn-overrides`는 이번 news route contract 축과 어긋나므로, 이번 라운드도 route source 3개와 직접 대응 API test만 점검하고 다른 user-facing/import 축으로 번지지 않게 제한했다.

## 핵심 변경
- 이번 라운드에서 추가 코드 수정은 하지 않았다. 현재 dirty route diff는 latest logic/test PASS와 같은 방향으로 정렬돼 있었고, route source 3개만으로 계약을 설명할 수 있었다.
- `src/app/api/planning/v3/news/refresh/route.ts`
  - `assertLocalHost`와 `onlyDev`는 제거되고 `assertSameOrigin(request)` + `requireCsrf(..., { allowWhenCookieMissing: true })`로 정리돼 있었다.
  - import path도 `@/lib/planning/v3/news/cli/newsRefresh`, `@/lib/planning/v3/news/store`, `@/lib/planning/v3/security/whitelist`로 정리돼 있었다.
- `src/app/api/planning/v3/news/recovery/route.ts`
  - write route로서 `assertSameOrigin(request)` + `requireCsrf(..., { allowWhenCookieMissing: true })`를 적용하고 있었다.
  - `previewRecoveryAction`, `runRecoveryAction`, `parseWithV3Whitelist` import path도 `@/lib/planning/v3/...` 기준으로 정리돼 있었다.
- `src/app/api/planning/v3/news/digest/route.ts`
  - read route라 `assertSameOrigin(request)`만 적용하고 CSRF는 두지 않는 현재 contract가 유지돼 있었다.
  - digest/indicator/security import path도 `@/lib/planning/v3/...` 기준으로 정리돼 있었다.
- direct API test 2개는 현재 route source와 같은 계약을 고정하고 있었다.
  - `tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts`: `example.com` same-origin 허용, `evil.com` cross-origin 차단, refresh/recovery write route contract 고정
  - `tests/planning-v3-news-digest-indicator-root.test.ts`: digest read route가 env-aware indicator override를 읽고 disabled 상태를 watchlist에 반영하는 contract 고정
- logic layer 조건부 포함 여부
  - 이번 라운드에서는 `planning/v3/news/cli/newsRefresh.ts`, `planning/v3/news/recovery.ts`를 조건부 포함으로 다시 열지 않았다.
  - route diff와 direct API test PASS만으로 same-origin / CSRF / import path contract를 설명할 수 있었다.

## 실제로 확인한 계약
- same-origin
  - `refresh`, `recovery`, `digest` 모두 `assertSameOrigin(request)`를 사용한다.
  - remote-host same-origin은 허용되고, cross-origin은 `ORIGIN_MISMATCH`로 차단된다.
- CSRF
  - write route인 `refresh`와 `recovery`만 `requireCsrf(..., { allowWhenCookieMissing: true })`를 사용한다.
  - read route인 `digest`는 same-origin read guard만 적용한다.
- import path
  - route 3개 모두 old relative planning 경로 대신 `@/lib/planning/v3/...` import로 정리돼 있었다.
  - 이번 라운드 기준으로 route source 수준에서 import path 정리는 이미 끝난 상태였다.

## 검증
- 기준선 확인
  - `sed -n '1,260p' work/3/13/2026-03-13-planning-v3-news-refresh-root-contract-followup.md`
  - `sed -n '1,260p' work/3/13/2026-03-13-planning-v3-rootdir-default-alignment.md`
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-golden-pipeline-qa-hardening.md`
- 상태 잠금
  - `git status --short -- src/app/api/planning/v3/news/refresh/route.ts src/app/api/planning/v3/news/recovery/route.ts src/app/api/planning/v3/news/digest/route.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts tests/planning-v3-news-digest-indicator-root.test.ts planning/v3/news/cli/newsRefresh.ts planning/v3/news/recovery.ts src/lib/planning/v3/news/digest.ts src/lib/planning/v3/news/recovery.ts src/lib/planning/v3/news/cli/newsRefresh.ts src/lib/planning/v3/indicators/specOverrides.ts src/lib/planning/v3/indicators/store.ts src/lib/planning/v3/security/whitelist.ts`
- audit
  - `sed -n '1,260p' src/app/api/planning/v3/news/refresh/route.ts`
  - `sed -n '1,320p' src/app/api/planning/v3/news/recovery/route.ts`
  - `sed -n '1,260p' src/app/api/planning/v3/news/digest/route.ts`
  - `git diff -- src/app/api/planning/v3/news/refresh/route.ts src/app/api/planning/v3/news/recovery/route.ts src/app/api/planning/v3/news/digest/route.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts tests/planning-v3-news-digest-indicator-root.test.ts`
  - `rg -n "assertSameOrigin|requireCsrf|allowWhenCookieMissing|assertLocalHost|onlyDev|runNewsRefresh|runRecoveryAction|buildDigest|loadEffectiveSeriesSpecs|resolveHref|ORIGIN_MISMATCH|LOCAL_ONLY" src/app/api/planning/v3/news/refresh/route.ts src/app/api/planning/v3/news/recovery/route.ts src/app/api/planning/v3/news/digest/route.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts tests/planning-v3-news-digest-indicator-root.test.ts`
- 테스트
  - `pnpm exec vitest run tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts tests/planning-v3-news-digest-indicator-root.test.ts`
  - PASS (`2 files`, `4 tests`)
- lint
  - `pnpm exec eslint src/app/api/planning/v3/news/refresh/route.ts src/app/api/planning/v3/news/recovery/route.ts src/app/api/planning/v3/news/digest/route.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts tests/planning-v3-news-digest-indicator-root.test.ts`
  - PASS
- build
  - `pnpm build`
  - PASS

## 미실행 검증
- `pnpm e2e:rc`
- `pnpm release:verify`
- `pnpm planning:v2:complete`
- `pnpm planning:current-screens:guard`
- logic layer 단위 테스트
  - route source를 실제 수정하지 않아 `planning/v3/news/recovery.test.ts`, `planning/v3/news/digest.test.ts` 재실행은 이번 라운드에서 생략했다.

## 남은 리스크
- 현재 route source 3개는 latest logic/test PASS와 같은 방향으로 정렬돼 있지만, branch 전체에는 여전히 `csv-parse`, `drafts-upload-flow` 등 더 넓은 축이 남아 있어 다음 라운드에서도 경계 잠금이 필요하다.
- 이번 라운드는 route source contract만 다뤘고, logic layer/rootDir 축은 재오픈하지 않았다. 이후 같은 경로를 다시 열면 same-origin contract와 rootDir contract를 섞지 않도록 주의가 필요하다.

## 다음 라운드 우선순위
1. `csv-parse`와 `drafts-upload-flow`는 그대로 바로 열지 말고, user-facing/import 범위를 다시 1축씩 분해한 뒤 연다.
2. 이번 `news-route same-origin-contract follow-up` 범위는 재오픈하지 않는다.
3. 다음 route/API batch가 열리더라도 same-origin/CSRF/import path 계약만 최소 범위로 묶고, drafts/import 흐름과 섞지 않는다.
