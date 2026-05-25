# 2026-05-26 릴리스 의존성 감사 게이트

## 변경 파일
- `.github/workflows/ci.yml`
- `package.json`
- `scripts/deps_audit.mjs`
- `scripts/release_verify.mjs`
- `docs/release.md`
- `docs/maintenance.md`
- `docs/planning-v2-release-checklist.md`
- `work/5/26/2026-05-26-release-deps-audit-gate.md`

## 사용 skill
- `planning-gate-selector`: release/ops script 변경에 필요한 최소 검증을 `node --check`, `pnpm deps:audit`, `pnpm release:verify`, `/work` guard 중심으로 선정했습니다.
- `work-log-closeout`: 실제 변경 파일, 실행한 검증, 남은 리스크를 `/work` 표준 섹션으로 정리했습니다.

## 변경 이유
- 직전 의존성 보안 패치에서 CI에는 `pnpm audit` 게이트가 추가됐지만, 로컬 릴리스 종합 검증인 `release:verify`에는 같은 감사 단계가 포함되지 않았습니다.
- PR 전 로컬 검증과 원격 CI가 같은 보안 기준을 보도록 `pnpm deps:audit` wrapper를 추가하고 릴리스 문서를 맞췄습니다.

## 핵심 변경
- `scripts/deps_audit.mjs`를 추가해 repository 공통 `pnpm_runner` 경로로 `pnpm audit`를 실행하게 했습니다.
- `package.json`에 `pnpm deps:audit` 스크립트를 추가했습니다.
- `scripts/release_verify.mjs`의 preflight 필수 게이트에 `deps:audit`를 추가했습니다.
- CI의 `Dependency audit` 단계도 `pnpm deps:audit`를 사용하도록 맞췄습니다.
- 릴리스/운영 문서와 planning v2 release checklist에 의존성 감사 게이트를 명시했습니다.

## 검증
- `node --check scripts/deps_audit.mjs scripts/release_verify.mjs` PASS
- `corepack pnpm deps:audit` PASS: `No known vulnerabilities found`
- `git diff --check` PASS
- `corepack pnpm release:verify` PASS: `cleanup:next-artifacts`, `deps:audit`, `planning:v2:complete`, `multi-agent:guard`, `planning:v2:compat`, `planning:v2:regress`, `test`, advisory `planning:ssot:check` 통과
- `corepack pnpm multi-agent:guard` PASS: 최신 `/work` 문서가 `work/5/26/2026-05-26-release-deps-audit-gate.md`로 인식됨

## 남은 리스크
- `pnpm deps:audit`는 npm advisory DB와 네트워크에 의존하므로 외부 레지스트리 장애 시 CI나 release gate가 일시 실패할 수 있습니다.
- 새 커밋을 push하면 PR #24 head SHA가 바뀌므로 GitHub Actions `CI`, `E2E Smoke`를 새 SHA 기준으로 다시 확인해야 합니다.
- `eslint-plugin-react-hooks` 7.0.1 override는 직전 배치에서 유지한 보수적 고정입니다. React Compiler 신규 lint 규칙 도입은 별도 리팩터링 배치가 필요합니다.
- PR #24 병합은 원격 `main` 변경이므로 명시 승인 전에는 진행하지 않습니다.

## 다음 라운드
- 변경분을 커밋하고 PR #24에 push한 뒤 새 head SHA 기준 GitHub Actions `CI`, `E2E Smoke`를 확인하겠습니다.
- 원격 검증 통과 후 PR 본문을 최신 SHA 및 검증 결과로 맞추겠습니다.
- React Compiler 신규 lint 규칙 도입 여부는 별도 리팩터링 배치에서 검토하겠습니다.
