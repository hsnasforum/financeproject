# 2026-03-12 planning-v3 news alert-rules RC e2e closeout

## 변경 파일
- `tests/e2e/news-settings-alert-rules.spec.ts`
- `package.json`
- `README.md`
- `docs/README.md`
- `work/3/12/2026-03-12-planning-v3-news-alert-rules-rc-e2e-closeout.md`

## 사용 skill
- `planning-gate-selector`: `news/settings -> alerts/digest` 전용 브라우저 회귀를 RC 기본 게이트에 편입할 때 필요한 최소 검증을 다시 고르기 위해 사용
- `work-log-closeout`: 이번 라운드의 실제 변경, 실행한 검증, Playwright 런타임 blocker를 `/work` 형식으로 남기기 위해 사용

## 변경 이유
- 최신 closeout 기준으로 `planning-v3 news/settings` 축의 실제 남은 공백은 `#news-settings-alert-rules` deep-link에서 `알림함 확인`과 `Digest 확인` follow-through 동선이 기본 RC 게이트에 없다는 점이었습니다.
- 기존 UI/API/unit 계약은 이미 닫혀 있었지만, 이 좁은 브라우저 플로우는 broad `pnpm e2e:rc` 내부에 포함되지 않아 다음 회귀에서 놓칠 수 있었습니다.
- 이번 라운드 목표는 화면 코드를 더 늘리지 않고, 전용 Playwright spec 1건을 추가해 RC 기본 묶음에 승격하는 최소 수정으로 리스크를 닫는 일이었습니다.

## 핵심 변경
- `tests/e2e/news-settings-alert-rules.spec.ts`를 추가해 `/planning/v3/news/settings#news-settings-alert-rules` deep-link, `알림함 확인 -> /planning/v3/news/alerts`, `Digest 확인 -> /planning/v3/news` follow-through를 좁게 고정했습니다.
- `package.json`의 `e2e:rc`, `e2e:rc:dev-hmr`에 새 spec을 넣어 RC 기본 게이트에서도 같은 흐름을 항상 확인하도록 맞췄습니다.
- `README.md`, `docs/README.md`의 RC 묶음 설명을 현재 스크립트 기준으로 `news/settings alert-rules 후속 확인`까지 포함하는 내용으로 갱신했습니다.
- 실제 Playwright 실행은 현재 Codex 런타임 제약으로 브라우저/관리 dev server 기동이 막혀 full PASS까지는 닫지 못했고, blocker 원인은 아래 검증 섹션과 남은 리스크에 그대로 남겼습니다.

## 검증
- `pnpm exec eslint tests/e2e/news-settings-alert-rules.spec.ts`
- `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json ok')"`
- `curl -I --max-time 5 http://127.0.0.1:3100`
- `pnpm exec playwright test tests/e2e/news-settings-alert-rules.spec.ts --list`
- `pnpm test tests/planning-v3-news-settings-ui.test.tsx tests/planning-v3-news-alerts-ui.test.tsx`
- `pnpm build`
- `[blocked] node scripts/playwright_with_webserver_debug.mjs test tests/e2e/news-settings-alert-rules.spec.ts --workers=1`
  - Playwright 관리 dev server가 `0.0.0.0:3126` bind에서 `listen EPERM`으로 기동 실패했습니다.
- `[blocked] E2E_EXTERNAL_BASE_URL=http://127.0.0.1:3100 node scripts/playwright_with_webserver_debug.mjs test tests/e2e/news-settings-alert-rules.spec.ts --workers=1`
  - 외부 base URL로 webServer 기동을 우회해도 Chromium headless shell이 `sandbox_host_linux.cc:41` fatal `shutdown: Operation not permitted`로 바로 종료됐습니다.

## 남은 리스크
- 새 spec 자체와 RC 번들 편입은 끝났지만, 현재 Codex 런타임에서는 Playwright browser launch가 막혀 `pnpm e2e:rc` 실실행 PASS를 이번 라운드에서 확인하지 못했습니다.
- 같은 이유로 `e2e:rc:dev-hmr`도 아직 미실행입니다. 저장소 코드보다는 현재 실행 환경의 브라우저/포트 권한 제약에 가깝습니다.
- `README.md`, `package.json`에는 이번 라운드 외의 기존 dirty 변경도 이미 섞여 있으므로, 후속 정리 시 unrelated hunk를 되돌리지 않도록 주의가 필요합니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
