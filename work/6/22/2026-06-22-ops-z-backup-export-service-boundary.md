# 2026-06-22 Ops Backup Export Service Boundary

## 변경 파일
- `src/app/api/ops/backup/export/route.ts`
- `src/lib/ops/backup/backupExportRouteService.ts`
- `tests/planning/ops/ops-backup-export-route-service-boundary.test.ts`
- `work/6/22/2026-06-22-ops-z-backup-export-service-boundary.md`

## 사용 skill
- finance-skill-routing: 최신 `/work` 흐름과 이번 implementation/verification round의 기본 skill 조합을 확인했습니다.
- planning-gate-selector: App Router API route와 ops/security 성격 변경에 맞춰 backup API 테스트, lint/typecheck/build, security check를 선택했습니다.
- work-log-closeout: 실제 변경 파일, 실행 검증, 남은 리스크를 종료 기록 형식에 맞춰 정리했습니다.

## 변경 이유
- `/api/ops/backup/export` route가 vault CSRF, vault archive 생성/암호화, audit, ops audit, metric 기록을 직접 처리하고 있어 repository/data ownership 목표의 service boundary와 맞지 않았습니다.
- export만 작은 PR로 분리해 preview/restore와 충돌하지 않게 하고, route는 dev/origin guard, auth, 입력 파싱, streaming 응답 매핑에 집중하게 했습니다.

## 핵심 변경
- `backupExportRouteService`를 추가해 CSRF 검증, CSRF cookie 설정, encrypted backup 생성, audit/metric 성공·실패 기록, export client error mapping을 담당하게 했습니다.
- `/api/ops/backup/export` route에서 `planningDataVault`, `vaultCsrf`, `securityAuditLog`, `metricsLog`, `auditLogStore`, `clientErrors` 직접 import를 제거했습니다.
- route는 `passphrase`, `mode`, `gzip` 입력과 current planning user 확인, gzip stream 응답 생성만 남기도록 축소했습니다.
- `ops-backup-export-route-service-boundary.test.ts`를 추가해 direct vault/archive/audit/metric import와 함수 호출이 route에 재유입되지 않게 고정했습니다.
- manager 분해와 로컬 정적 스캔 결과를 반영했으며, Spark/explorer 정적 조사는 시간 내 산출물 없이 종료했습니다.

## 검증
- PASS: `./node_modules/.bin/vitest run tests/planning/ops/ops-backup-export-route-service-boundary.test.ts`
- PASS: `./node_modules/.bin/vitest run tests/planning/ops/backup-api.test.ts`
- PASS: `rg -n -e 'lib/audit/auditLogStore' -e 'lib/ops/securityAuditLog' -e 'lib/ops/metricsLog' -e 'lib/ops/backup/clientErrors' -e 'lib/ops/backup/planningDataVault' -e 'lib/planning/security/vaultCsrf' -e 'appendAuditLog\(' -e 'appendOpsAuditEvent\(' -e 'appendOpsMetricEvent\(' -e 'buildPlanningDataVaultZip\(' -e 'encryptPlanningDataVaultArchive\(' -e 'consumeVaultCsrfOrThrow\(' -e 'ensureVaultCsrfCookie\(' -e 'toBackupExportClientError\(' src/app/api/ops/backup/export/route.ts || true`
- PASS: `git diff --check`
- PASS: `corepack pnpm sec:check`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- TIMEOUT: `corepack pnpm build` 300초 제한에서 종료 상태 증거를 얻지 못했고, 남은 build 프로세스 종료 후 재실행했습니다.
- PASS: `corepack pnpm build`
- PASS: `git diff --check --cached`
- PASS: `corepack pnpm multi-agent:guard`

## 남은 리스크
- `/api/ops/backup/preview`와 `/api/ops/backup/restore`는 아직 vault/archive/audit helper를 route에서 직접 가져오며, 같은 패턴으로 후속 분리가 필요합니다.
- export route의 streaming 응답은 기존 동작을 유지했지만, `/ops/backup` 사용자 플로우 e2e는 이번 로컬 검증에서 실행하지 않았습니다.
- Spark/explorer 정적 조사 산출물은 timeout으로 반영하지 못했고, 이번 후보 선정은 manager 분해와 로컬 `rg` 스캔에 기반합니다.

## 다음 라운드
- `/api/ops/backup/preview` route의 multipart 검증, upload temp, decrypt/preview, preview token, audit/metric 기록을 service boundary로 분리합니다.
- 그 다음 `/api/ops/backup/restore` route를 별도 PR로 분리해 backup import/restore 흐름의 blast radius를 낮춥니다.
- dev-only 파일 직접 접근 route는 운영 표면과 분리해 별도 정적 분류표로 관리합니다.
