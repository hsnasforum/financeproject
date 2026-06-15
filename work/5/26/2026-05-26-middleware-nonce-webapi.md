# 2026-05-26 middleware nonce Web API

## 변경 파일
- `middleware.ts`
- `work/5/26/2026-05-26-middleware-nonce-webapi.md`

## 사용 skill
- `planning-gate-selector`: middleware와 production runtime 경계 변경에 맞춰 `lint`, `sec:check`, `build`, production smoke 검증을 고르기 위해 사용했습니다.
- `work-log-closeout`: 실제 수정, 실행한 검증, 남은 승인 경계를 `/work` 형식으로 남기기 위해 사용했습니다.

## 변경 이유
- 병합 전 고위험 정적 감사 중 `middleware.ts`의 CSP nonce 생성이 Node 전용 `Buffer` 전역에 의존하는 것을 확인했습니다.
- Next middleware는 배포 런타임에서 Web API 경계에 가까우므로, Node 전용 전역에 기대지 않는 nonce 생성이 더 안전합니다.
- PR #24는 mergeable이고 원격 CI/E2E가 green이지만, 병합 전 런타임 호환성 위험을 줄이는 작은 수정은 승인 없이 되돌릴 수 있는 범위입니다.

## 핵심 변경
- `crypto.getRandomValues`와 `btoa`를 사용해 CSP nonce를 생성하도록 바꿨습니다.
- nonce 길이는 16바이트 난수 기반으로 유지하고, CSP에 들어가는 값은 base64 문자열로 유지했습니다.
- DART/data-source, dev route guard, production 비노출 경계를 정적 감사했으며 신규 blocker는 확인하지 못했습니다.
- PR #24 병합은 여전히 원격 `main` 변경이므로 명시 승인 전에는 진행하지 않습니다.

## 검증
- `git status --short --branch --untracked-files=all` PASS: 작업 전 브랜치와 clean 상태 확인
- `git diff --name-only origin/main...HEAD | rg '(^middleware\\.ts$|^next\\.config\\.ts$|^playwright\\.config\\.ts$|^src/app/api/dev/|^src/app/api/public/|^src/app/settings/data-sources|^src/app/public/dart|^src/components/.*Dart|^src/components/.*DataSource|^scripts/security|^scripts/next_|^scripts/start_|^docs/current-screens|^docs/runtime|^\\.env\\.example)'` PASS: 고위험 diff 후보 확인
- `rg -n 'TODO|FIXME|HACK|XXX|@ts-ignore|@ts-expect-error|eslint-disable' src tests scripts planning docs middleware.ts next.config.ts playwright.config.ts --glob '!**/*.map' --glob '!docs/dart-rules-quality-report.md' --glob '!docs/data-freshness-report.md' --glob '!docs/schema-drift-report.md'` PASS: 신규 blocker 후보 없음. 기존 `.mjs` 테스트 import 예외와 이미지 lint 예외 중심입니다.
- `corepack pnpm lint` PASS
- `corepack pnpm sec:check` PASS
- `git diff --check` PASS
- `corepack pnpm build` PASS
- `node scripts/playwright_with_webserver_debug.mjs --runtime=production --port=3204 test tests/e2e/smoke.spec.ts --workers=1 --reporter=line` PASS: 6 passed

## 남은 리스크
- 최신 커밋을 push하면 PR #24 head SHA가 다시 바뀌므로 원격 `CI`, `E2E Smoke`를 새 SHA 기준으로 다시 확인해야 합니다.
- 이번 변경은 middleware nonce 생성 경계만 좁힌 것이며, PR 전체 421개 파일 diff에 대한 human review를 대체하지 않습니다.
- 병합 이후에는 `main` 기준 fetch/pull과 기본 smoke 또는 release gate를 다시 확인해야 합니다.

## 다음 라운드 우선순위
- 이번 middleware 수정과 `/work` 기록을 커밋하고 PR 브랜치에 push합니다.
- PR #24 최신 head SHA 기준 GitHub Actions `CI`, `E2E Smoke`를 재확인합니다.
- 명시 승인이 있으면 PR #24를 `main`에 병합하고 병합 후 main 기준 검증을 실행합니다.
