# 2026-05-26 GitHub Actions Node 24 런타임 대응

## 변경 파일
- `.github/workflows/ci.yml`
- `.github/workflows/e2e-smoke.yml`
- `.github/workflows/daily-refresh.yml`
- `.github/workflows/rules-tune-pr.yml`
- `.github/workflows/release.yml`
- `work/5/26/2026-05-26-github-actions-node24-runtime.md`

## 사용 skill
- `planning-gate-selector`: GitHub workflow 변경의 검증 범위를 정적 diff, 구버전 참조 검색, 원격 PR Actions 중심으로 선정했습니다.
- `work-log-closeout`: 실제 변경 파일, 확인한 근거, 실행 검증, 남은 리스크를 `/work` 표준 섹션으로 정리했습니다.

## 변경 이유
- PR Actions 로그에서 `actions/checkout@v4`, `actions/setup-node@v4`, `pnpm/action-setup@v4`가 Node.js 20 action runtime deprecation 경고를 냈습니다.
- GitHub-hosted runner가 이미 `2.334.0`으로 확인됐고, 교체 대상 action의 최신 major가 `runs.using: node24`를 선언하므로 action runtime 경고를 선제적으로 제거합니다.
- 앱 테스트와 빌드가 사용하는 `node-version: 20`은 이번 배치에서 변경하지 않아 런타임 변경 위험을 분리했습니다.

## 핵심 변경
- `actions/checkout@v4`를 `actions/checkout@v6`으로 올렸습니다.
- `actions/setup-node@v4`를 `actions/setup-node@v5`로 올렸습니다.
- `pnpm/action-setup@v4`를 `pnpm/action-setup@v6`으로 올렸습니다.
- scheduled/manual workflow의 `actions/upload-artifact@v4`, `peter-evans/create-pull-request@v7`, release workflow의 `softprops/action-gh-release@v2`도 Node 24 runtime major로 맞췄습니다.
- workflow command runtime은 계속 `node-version: 20`을 사용합니다.

## 검증
- `if rg -n 'actions/checkout@v4|actions/setup-node@v4|pnpm/action-setup@v4|actions/upload-artifact@v4|peter-evans/create-pull-request@v7|softprops/action-gh-release@v2' .github/workflows -S; then exit 1; else echo 'no legacy action refs'; fi` PASS: 남은 구버전 참조 없음
- `git diff --check` PASS
- `corepack pnpm multi-agent:guard` PASS: 최신 `/work` 문서가 `work/5/26/2026-05-26-github-actions-node24-runtime.md`로 인식됨

## 남은 리스크
- `daily-refresh`, `rules-tune-pr`, `release`는 schedule/manual/tag push 조건이라 이번 PR Actions에서 자동 실행되지 않습니다. 해당 workflow는 다음 실제 트리거 또는 수동 실행에서 확인해야 합니다.
- `node-version: 20`은 앱 command runtime 유지 목적의 보수적 선택입니다. 앱 자체를 Node 24로 올리는 작업은 별도 배치에서 dependency/build/e2e까지 함께 확인해야 합니다.
- 새 커밋을 push하면 PR #24 head SHA가 바뀌므로 GitHub Actions `CI`, `E2E Smoke`를 새 SHA 기준으로 다시 확인해야 합니다.
- PR #24 병합은 원격 `main` 변경이므로 명시 승인 전에는 진행하지 않습니다.

## 다음 라운드
- 변경분을 커밋하고 PR #24에 push한 뒤 새 head SHA 기준 GitHub Actions `CI`, `E2E Smoke`를 확인하겠습니다.
- 원격 검증 통과 후 PR 본문을 최신 SHA 및 검증 결과로 맞추겠습니다.
- scheduled/manual/tag workflow는 별도 실행 권한과 목적이 정해지면 실제 run으로 검증하겠습니다.
