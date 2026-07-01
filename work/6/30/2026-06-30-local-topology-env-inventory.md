# 2026-06-30 로컬 topology/env inventory 보강

## 변경 파일
- `work/6/30/2026-06-30-local-topology-env-inventory.md`
- `work/6/29/2026-06-29-0629-delivery-final-report-draft.md`

## 사용 skill
- `planning-gate-selector`: 코드 변경이 아닌 운영 근거 문서 보강이므로 검증 범위를 상태 확인, ops safety 실행, diff 검사로 제한했습니다.
- `work-log-closeout`: 실제 실행한 명령과 운영 증명/로컬 추론의 경계를 `/work` 표준 형식으로 기록했습니다.

## 변경 이유
- 전달문은 실제 운영 topology와 환경변수 확인을 요구합니다.
- 현재 GitHub/운영 접근은 차단되어 있으므로 실제 production 증거는 만들 수 없습니다.
- 대신 repo 문서·스크립트·로컬 runtime report가 증명하는 범위를 별도로 보강했습니다.

## 핵심 변경
- repo 문서 기준 production에서는 `PLANNING_NAMESPACE_ENABLED=true` 또는 `PLANNING_SINGLE_USER_MODE=true` 중 하나가 필수임을 재확인했습니다.
- `docs/deploy.md`는 여러 Node 프로세스나 여러 인스턴스가 같은 `PLANNING_DATA_DIR` 파일 루트를 공유하면 process-local mutex만으로 저장 완료를 보장하지 않는다고 명시합니다.
- 최신 로컬 `planning:v2:ops:safety` 리포트를 재생성했습니다.
- 로컬 WSL runtime env에는 `DATABASE_URL`, `PLANNING_AUTH_REQUIRED`, `PLANNING_NAMESPACE_ENABLED`, `PLANNING_SINGLE_USER_MODE`, `PLANNING_DATA_DIR`, `NODE_ENV`, `AUTH_SECRET`, `NEXTAUTH_SECRET`가 설정되어 있지 않음을 redaction 방식으로 확인했습니다.
- 로컬 `.env.local` 파일에는 `DATABASE_URL` 키가 있지만 pnpm 실행 runtime에는 자동 로드되지 않았고, safety report도 `databaseUrl=missing`으로 기록했습니다.

## 검증
- `git rev-parse HEAD main origin/main` PASS:
  - HEAD `baf6325ecdadb3a2b249c0946490ec48887430ab`
  - main/origin/main `5e1cc1c901f9ad3925fb450a8446b192ed4bf8f5`
- `git status --short --branch --untracked-files=normal` PASS:
  - staged 파일 없음
  - modified/untracked 파일 존재
- PowerShell `Select-String`으로 `.env.example`, `.env.local.example`, `docs/deploy.md`, `docs/planning-v2-ops.md`, `scripts/next_prod_safe.mjs`, `scripts/planning_v2_ops_safety.mjs`, `src/lib/planning/auth/currentUser.ts`, `src/lib/planning/store/namespace.ts`, `package.json` 확인 PASS.
- `corepack pnpm planning:v2:ops:safety -- --legacy-mode=check --legacy-limit=500 --legacy-fail-threshold=-1` PASS:
  - `opsRun=PASS`
  - `legacyBackfill=PASS`
  - `legacyCandidates=0`
  - report `.data/planning/ops/reports/20260630-044955-safety.json`
  - log `.data/planning/ops/logs/20260630-044955-safety.log`
- 최신 safety report 요약:
  - `operatingEnvironment.nodeEnv=development`
  - `authRequired=true`
  - `planningNamespaceEnabled=false`
  - `planningSingleUserMode=false`
  - `storageMode=local-default`
  - `databaseUrl=missing`
  - `dataDir=.data/planning`
  - `topology.writeSerializationScope=process-local`
  - `topology.sharedFileStoreCompletion=not_proven`
- WSL `printenv` redaction 확인 PASS:
  - `DATABASE_URL=missing`
  - `PLANNING_AUTH_REQUIRED=missing`
  - `PLANNING_NAMESPACE_ENABLED=missing`
  - `PLANNING_SINGLE_USER_MODE=missing`
  - `PLANNING_DATA_DIR=missing`
  - `NODE_ENV=missing`
  - `AUTH_SECRET=missing`
  - `NEXTAUTH_SECRET=missing`
- 미사용 증거:
  - regex quoting 오류가 난 `rg --files`/`rg`/bash env loop 출력은 증거로 사용하지 않았고 PowerShell/명시 명령으로 재실행했습니다.

## 남은 리스크
- [deferred external verification] 위 결과는 로컬 WSL runtime과 repo 문서 근거입니다. 실제 production topology/env 증거는 현재 범위 밖입니다.
- [deferred external verification] production에서 같은 safety command를 실행한 report/log 수집은 현재 범위 밖입니다.
- [deferred external verification] 실제 운영 legacy inventory, conflict, quarantine 수는 현재 범위 밖입니다.
- [deferred GitHub publishing] commit/push/PR은 현재 범위 밖입니다.
- [deferred external verification] 원격 CI는 현재 범위 밖입니다.
