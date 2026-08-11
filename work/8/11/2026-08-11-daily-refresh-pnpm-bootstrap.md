# 2026-08-11 Daily Refresh pnpm 부트스트랩 복구

## 변경 파일

- `.github/workflows/daily-refresh.yml`
- `package.json`
- `pnpm-lock.yaml`
- `tests/daily-refresh-workflow-contract.test.ts`
- `work/8/11/2026-08-11-daily-refresh-pnpm-bootstrap.md`

## 사용 skill

- `finance-skill-routing`: 운영 workflow 수정에 필요한 최소 skill 조합을 선정했습니다.
- `planning-gate-selector`: workflow·ops 변경에 맞춰 focused test, `pnpm verify`, `pnpm build`를 검증 게이트로 선택했습니다.
- `dart-data-source-hardening`: 외부 데이터 갱신 workflow의 실패 모드와 자동 PR 차단 경계를 확인했습니다.
- `github:github`: 최신 Actions 실행과 기존 PR 상태를 확인했습니다.
- `github:yeet`: 최신 `origin/main` 기반 격리 브랜치에서 게시 범위와 Git 절차를 통제했습니다.
- `chrome:control-chrome`: 로그인된 GitHub에서 최신 실패 실행의 runner 시작 여부와 annotation을 확인했습니다.
- `work-log-closeout`: 실제 변경·검증·잔여 위험을 이 문서에 정리했습니다.

## 변경 이유

- GitHub 결제 제한은 해소되어 hosted runner가 다시 시작됐지만, `Daily Refresh #166`은 `actions/setup-node`가 cache 초기화 중 `pnpm` 실행 파일을 찾지 못해 실패했습니다.
- 기존 workflow는 `corepack enable`보다 먼저 `actions/setup-node`의 `cache: "pnpm"`을 실행해, 새 runner 이미지에서 Install 단계에 도달하기 전에 중단될 수 있었습니다.
- PR 게시 직후 원격 dependency audit에서 새 HIGH advisory 4건이 탐지됐고, `brace-expansion@1`, `fast-uri`, `js-yaml`, `nanoid`의 취약 패치 버전이 저장소 override 또는 lockfile에 고정돼 CI가 중단됐습니다.

## 핵심 변경

- `actions/setup-node`의 선행 pnpm cache 설정을 제거해 `Setup Node`가 pnpm 설치 여부에 의존하지 않도록 했습니다.
- 다음 Install 단계의 기존 `corepack enable`과 `pnpm install --frozen-lockfile`이 pnpm 부트스트랩을 소유하도록 유지했습니다.
- workflow 계약 테스트가 Setup Node 블록에 선행 `cache: "pnpm"`이 다시 들어오는 회귀를 차단합니다.
- dependency audit가 지적한 네 패키지만 안전 패치 버전(`brace-expansion 1.1.18`, `fast-uri 3.1.5`, `js-yaml 4.3.1`, `nanoid 3.3.17`)으로 올렸습니다.
- 자동 refresh, evidence 검증, artifact 업로드, 자동 PR allowlist와 fail-closed 조건은 변경하지 않았습니다.

## 검증

- `DATABASE_URL='file:/tmp/finance-daily-refresh-test.db' /home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm install --frozen-lockfile`: PASS
- `DATABASE_URL='file:/tmp/finance-daily-refresh-test.db' /home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm deps:audit`: PASS, 662 packages·687 versions 검사 및 advisory 0건
- `DATABASE_URL='file:/tmp/finance-daily-refresh-test.db' /home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm test tests/daily-refresh-workflow-contract.test.ts tests/daily-refresh-ci-contract.test.ts tests/daily-refresh-ops-contract.test.ts`: PASS, 3파일 19테스트
- `DATABASE_URL='file:/tmp/finance-daily-refresh-test.db' /home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm verify`: PASS, 826파일 2,922테스트 포함 lint·typecheck·보안·데이터 계약 검증 통과
- `DATABASE_URL='file:/tmp/finance-daily-refresh-test.db' /home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm build`: PASS, 250 pages
- `pnpm e2e:rc`: 미실행. UI·route·selector 동작을 변경하지 않아 대상에서 제외했습니다.

## 남은 리스크

- 로컬 검증은 `actions/setup-node`의 runner 내부 동작 자체를 재현하지 못하므로, PR의 GitHub-hosted CI 실행이 최종 부트스트랩 검증입니다.
- Daily Refresh의 다음 실행은 필수 secret 또는 upstream 상태 때문에 별도 실패할 수 있으며, 이번 변경은 pnpm bootstrap 실패만 해결합니다.
- dependency audit는 GitHub advisory DB의 신규 항목에 따라 앞으로도 별도 패치 업데이트를 요구할 수 있습니다.

## 이번 라운드 완료 항목

- GitHub 결제 차단 해소와 hosted runner 실제 시작을 확인했습니다.
- `pnpm` 선행 cache 의존성을 제거하고 회귀 테스트를 추가했습니다.
- 원격 CI에서 새로 탐지된 HIGH advisory 4건을 최소 패치 버전 override로 해소했습니다.
- 최신 `origin/main` 기반 격리 브랜치에서 전체 로컬 검증을 완료했습니다.

## 다음 라운드 우선순위

- PR의 CI/E2E Smoke 결과를 확인하고 허용 상태이면 병합합니다.
- 병합 후 `workflow_dispatch` 또는 다음 scheduled run에서 Setup Node와 Install 단계가 실제로 통과하는지 확인합니다.
