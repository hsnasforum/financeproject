# 2026-06-22 Ops Backup Preview Service Boundary

## 변경 파일
- `src/app/api/ops/backup/preview/route.ts`
- `src/lib/ops/backup/backupPreviewRouteService.ts`
- `tests/planning/ops/ops-backup-preview-route-service-boundary.test.ts`
- `work/6/22/2026-06-22-ops-zz-backup-preview-service-boundary.md`

## 사용 skill
- finance-skill-routing: 최신 `/work` 흐름과 이번 route/service implementation round의 기본 skill 조합을 확인했습니다.
- planning-gate-selector: App Router API route와 ops/security backup preview 변경에 맞춰 backup API 회귀, 보안, lint/typecheck/build 검증을 선택했습니다.
- work-log-closeout: 실제 변경 파일, 실행 검증, 잔여 리스크, 다음 라운드 인계 항목을 표준 `/work` 형식으로 정리했습니다.

## 변경 이유
- `/api/ops/backup/preview` route가 upload temp, backup decrypt/preview, preview token/session cookie, audit, ops audit, metric 기록을 직접 처리하고 있어 repository/data ownership 목표의 service boundary와 맞지 않았습니다.
- export route 분리와 같은 패턴을 preview에도 적용해 route는 dev/origin guard, auth, formData 파싱, 입력 검증 결과 응답, 최종 JSON 응답 매핑에 집중하게 했습니다.

## 핵심 변경
- `backupPreviewRouteService`를 추가해 CSRF 검증, CSRF cookie 설정, file upload validation, encrypted backup preview 생성, preview token/session cookie 처리, audit/metric 성공·실패 기록, preview client error mapping을 담당하게 했습니다.
- `/api/ops/backup/preview` route에서 `planningDataVault`, `previewSession`, `previewToken`, `uploadTemp`, `vaultCsrf`, `securityAuditLog`, `metricsLog`, `auditLogStore`, `opsPolicy`, `clientErrors` 직접 import를 제거했습니다.
- route는 multipart parse, local/same-origin guard, current planning user 확인, service 결과 응답 매핑만 남기도록 축소했습니다.
- `ops-backup-preview-route-service-boundary.test.ts`를 추가해 direct upload/archive/token/audit/metric import와 함수 호출이 route에 재유입되지 않게 고정했습니다.
- manager 분해 결과에 따라 Spark/explorer는 이번 라운드에 쓰지 않았고, restore route는 후속 PR로 분리했습니다.

## 검증
- PASS: `./node_modules/.bin/vitest run tests/planning/ops/ops-backup-preview-route-service-boundary.test.ts`
- PASS: `./node_modules/.bin/vitest run tests/planning/ops/backup-api.test.ts`
- PASS: `rg -n -e 'lib/audit/auditLogStore' -e 'lib/ops/securityAuditLog' -e 'lib/ops/metricsLog' -e 'lib/ops/backup/clientErrors' -e 'lib/ops/backup/planningDataVault' -e 'lib/ops/backup/previewSession' -e 'lib/ops/backup/previewToken' -e 'lib/ops/backup/uploadTemp' -e 'lib/ops/opsPolicy' -e 'lib/planning/security/vaultCsrf' -e 'appendAuditLog\(' -e 'appendOpsAuditEvent\(' -e 'appendOpsMetricEvent\(' -e 'decryptPlanningDataVaultArchive\(' -e 'previewPlanningDataVaultZip\(' -e 'getOrCreateBackupPreviewSessionToken\(' -e 'setBackupPreviewSessionCookie\(' -e 'createBackupPreviewToken\(' -e 'readUploadBufferViaTemp\(' -e 'loadOpsPolicy\(' -e 'consumeVaultCsrfOrThrow\(' -e 'ensureVaultCsrfCookie\(' -e 'toBackupArchiveClientError\(' src/app/api/ops/backup/preview/route.ts || true`
- PASS: `git diff --check`
- PASS: `corepack pnpm sec:check`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm build`
- PASS: `git diff --check --cached`
- PASS: `corepack pnpm multi-agent:guard`

## 남은 리스크
- `/api/ops/backup/restore`는 아직 upload temp, decrypt/restore, preview token consumption, audit/metric helper를 route에서 직접 가져오며 후속 분리가 필요합니다.
- preview route의 HTTP 응답 계약은 `backup-api.test.ts`로 보존했지만, `/ops/backup` 사용자 플로우 e2e는 이번 로컬 검증에서 실행하지 않았습니다.
- dev-only 파일 직접 접근 route는 이번 범위 밖이며 별도 정적 분류표로 관리해야 합니다.

## 다음 라운드
- `/api/ops/backup/restore` route를 별도 PR로 service boundary 뒤로 분리합니다.
- restore route 분리 시 preview token/session mismatch, expired token, archive/passphrase mismatch, merge/replace restore audit·metric 케이스를 `backup-api.test.ts`로 재검증합니다.
- backup export/preview/restore 세 route가 모두 분리된 뒤 ops backup route boundary 묶음 스캔을 추가로 고정할지 판단합니다.
