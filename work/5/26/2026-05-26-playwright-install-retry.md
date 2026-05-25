# 2026-05-26 Playwright 설치 재시도 안정화

## 변경 파일
- `.github/workflows/ci.yml`
- `.github/workflows/e2e-smoke.yml`
- `package.json`
- `scripts/playwright_install_chromium.mjs`
- `tests/playwright-install-chromium.test.ts`
- `docs/maintenance.md`
- `work/5/26/2026-05-26-playwright-install-retry.md`

## 사용 skill
- `planning-gate-selector`: CI/E2E workflow와 ops script 변경에 필요한 검증을 script 문법, targeted unit test, lint, diff check, 원격 PR Actions 중심으로 선정했습니다.
- `work-log-closeout`: 실제 실행 명령과 아직 원격으로 확인해야 하는 리스크를 `/work` 표준 섹션으로 정리했습니다.

## 변경 이유
- 직전 PR Actions에서 `dart_index_missing` job의 `pnpm exec playwright install --with-deps chromium` 단계가 apt 패키지 조회 후 job timeout까지 멈춰 취소됐고, 동일 job 재실행은 성공했습니다.
- 테스트 자체 실패가 아니라 GitHub runner/apt/Playwright 설치 transient에 가까운 실패였으므로, 같은 설치 단계를 per-attempt timeout과 재시도로 감싸 재발 시 전체 job timeout까지 기다리지 않도록 했습니다.

## 핵심 변경
- `scripts/playwright_install_chromium.mjs`를 추가해 Chromium 설치를 최대 2회, attempt당 기본 7분 timeout으로 실행하게 했습니다.
- `package.json`에 `pnpm e2e:install:chromium` 스크립트를 추가했습니다.
- CI와 E2E Smoke workflow의 Playwright Chromium 설치 단계를 공통 wrapper로 교체했습니다.
- wrapper config parsing 단위 테스트를 추가했습니다.
- `docs/maintenance.md`에 GitHub Actions Playwright 설치 wrapper 운영 원칙을 남겼습니다.

## 검증
- `node --check scripts/playwright_install_chromium.mjs` PASS
- `corepack pnpm test tests/playwright-install-chromium.test.ts tests/pnpm-runner.test.ts` PASS: 2 files / 4 tests
- `if rg -n 'pnpm exec playwright install --with-deps chromium' .github/workflows package.json scripts docs -S; then exit 1; else echo 'no raw playwright install workflow refs'; fi` PASS
- `corepack pnpm lint` PASS
- `git diff --check` PASS
- `corepack pnpm multi-agent:guard` PASS: 최신 `/work` 문서가 `work/5/26/2026-05-26-playwright-install-retry.md`로 인식됨

## 남은 리스크
- wrapper의 실제 `--with-deps` 설치 경로는 PR Actions에서 새 head SHA 기준으로 다시 확인해야 합니다.
- local WSL에서는 system dependency 설치가 환경별 sudo/apt 상태에 영향을 받으므로 이번 배치의 권위 있는 smoke는 GitHub-hosted runner의 PR `CI`, `E2E Smoke` 결과입니다.
- timeout 기본값 7분, attempts 2회는 현재 25~35분 workflow timeout을 넘지 않기 위한 보수적 값입니다. runner 환경이 지속적으로 느려지면 workflow timeout과 함께 재조정해야 합니다.
- PR #24 병합은 원격 `main` 변경이므로 명시 승인 전에는 진행하지 않습니다.

## 다음 라운드
- 변경분을 커밋하고 PR #24에 push한 뒤 새 head SHA 기준 GitHub Actions `CI`, `E2E Smoke`를 확인하겠습니다.
- 원격 검증 통과 후 PR 본문을 최신 SHA 및 검증 결과로 맞추겠습니다.
- scheduled/manual/tag workflow는 별도 실행 권한과 목적이 정해지면 실제 run으로 검증하겠습니다.
