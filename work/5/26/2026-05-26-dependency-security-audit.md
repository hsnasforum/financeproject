# 2026-05-26 의존성 보안 패치

## 변경 파일
- `.github/workflows/ci.yml`
- `package.json`
- `pnpm-lock.yaml`
- `docs/dart-rules-quality-report.md`
- `docs/data-freshness-report.md`
- `docs/schema-drift-report.md`
- `work/5/26/2026-05-26-dependency-security-audit.md`

## 사용 skill
- `planning-gate-selector`: Next/PostCSS/Hono/fast-uri 의존성 패치의 영향 범위를 audit, verify, build, e2e smoke 중심으로 선정했습니다.
- `work-log-closeout`: 실제 실행 명령, 1차 실패, 최종 통과 상태, 남은 리스크를 `/work` 표준 섹션으로 정리했습니다.

## 변경 이유
- `corepack pnpm audit --audit-level high`에서 Next.js 16.2.3의 high 취약점과 Prisma 전이 의존성 `fast-uri` 취약점이 확인됐습니다.
- high 제거 후 전체 `corepack pnpm audit`에서 Prisma 전이 `hono`와 Next/Tailwind/Vite 경로의 `postcss` moderate/low 취약점도 남아 있음을 확인했습니다.
- 앱 기능 변경 없이 보안 패치 버전만 적용해 audit 결과를 `No known vulnerabilities found` 상태로 맞췄습니다.

## 핵심 변경
- `next`와 `eslint-config-next`를 `16.2.3`에서 `16.2.6`으로 올렸습니다.
- `pnpm.overrides`에 `fast-uri@3.1.2`, `hono@4.12.18`, `postcss@8.5.10`을 추가해 전이 취약점을 제거했습니다.
- `eslint-config-next` 16.2.6이 끌어오는 `eslint-plugin-react-hooks` 7.1.1의 신규 React Compiler lint 확장을 피하기 위해 기존 통과 기준인 `7.0.1`로 고정했습니다.
- CI의 install 직후 단계에 `pnpm audit`를 추가해 같은 종류의 의존성 취약점이 PR 게이트를 통과하지 않도록 했습니다.
- `corepack pnpm verify` 실행으로 DART/schema/freshness 리포트 기준 시각이 갱신됐습니다.

## 검증
- `corepack pnpm audit --audit-level high` 1차 FAIL: `fast-uri`, `next` high 취약점 확인
- `corepack pnpm outdated --format list` 실행: `next`/`eslint-config-next` 최신 패치 후보 `16.2.6` 확인
- `corepack pnpm audit` 1차 FAIL: high 제거 후 `hono`, `postcss` moderate/low 취약점 확인
- `corepack pnpm install` PASS: overrides 반영 및 `prisma generate` 완료
- `corepack pnpm audit` PASS: `No known vulnerabilities found`
- `git diff --check` PASS
- `corepack pnpm verify` 1차 FAIL: `eslint-plugin-react-hooks` 7.1.1 신규 lint 규칙으로 기존 코드 118건 지적
- `corepack pnpm verify` PASS: 662 files / 2031 tests
- `corepack pnpm build` PASS: Next.js 16.2.6 production build 완료
- `corepack pnpm e2e:rc` PASS: 24 passed, 1 skipped
- `corepack pnpm release:verify` 1차 FAIL: 최신 `/work` note의 `## 다음 라운드` 섹션 누락을 `multi-agent:guard`가 지적했습니다. 본 문서 보완 후 재실행 예정입니다.
- `corepack pnpm release:verify` PASS: `planning:v2:complete`, `multi-agent:guard`, `planning:v2:compat`, `planning:v2:regress`, `test`, advisory `planning:ssot:check` 통과
- `corepack pnpm multi-agent:guard` PASS: CI workflow 변경과 본 `/work` 기록 보정 후 확인

## 남은 리스크
- `eslint-plugin-react-hooks` 7.0.1 override는 lint 기준 유지를 위한 보수적 고정입니다. React Compiler 신규 규칙을 도입하려면 별도 리팩터링 배치가 필요합니다.
- `postcss`, `hono`, `fast-uri`는 전이 의존성 override이므로 다음 대규모 의존성 업데이트 때 제거 가능 여부를 다시 확인해야 합니다.
- CI의 `pnpm audit`는 npm advisory DB와 네트워크에 의존하므로, 외부 레지스트리 장애 시 일시 실패 가능성이 있습니다.
- 새 커밋을 push하면 PR #24 head SHA가 바뀌므로 GitHub Actions `CI`, `E2E Smoke`를 새 SHA 기준으로 다시 확인해야 합니다.
- PR #24 병합은 원격 `main` 변경이므로 명시 승인 전에는 진행하지 않습니다.

## 다음 라운드
- 변경분을 커밋하고 PR #24에 push한 뒤 새 head SHA 기준 GitHub Actions `CI`, `E2E Smoke`를 확인하겠습니다.
- 원격 검증 통과 후 PR 본문과 `/work` 기록을 최신 SHA 및 검증 결과로 맞추겠습니다.
- React Compiler 신규 lint 규칙 도입 여부는 별도 리팩터링 배치에서 검토하겠습니다.
