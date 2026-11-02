# Planning v2 Ops Dashboard

## 개요
- 통합 운영 페이지: `/ops/planning`
- 목적: assumptions / regression / cache / store 상태를 한 화면에서 확인하고 필요한 운영 액션을 실행

## 프로필 조회 실패와 원본 보존

- 실제 프로필 파일이 없을 때만 신규 저장소의 기본 프로필 생성과 정상 legacy 이전을 허용합니다.
- JSON·저장 형식·본문 오류는 `STORAGE_CORRUPT`(500), 파일 접근 오류는 `STORAGE_UNAVAILABLE`(503)로 응답합니다. Vault 잠금과 복호화 오류도 빈 목록으로 처리하지 않습니다.
- 목록에 손상된 프로필이 섞이면 전체 목록 요청을 실패시킵니다. 화면의 오류 안내와 `다시 불러오기`를 사용하며, 손상 항목을 뺀 정상 목록으로 표시하지 않습니다.
- 손상된 본문이나 동일 ID의 legacy 파일을 자동 초기화·삭제·이동하지 않습니다. 프로필 변경과 휴지통 복원도 기존 본문을 먼저 확인합니다. 정상 본문으로 재생성할 수 있는 metadata/index는 기존 복구 동작을 유지합니다.
- 기존 파일을 보관한 뒤 접근 권한·저장 공간·Vault 잠금 상태를 확인합니다. 일반 production에서는 `/ops/doctor`가 차단되므로 프로필 오류 응답에 해당 링크를 제공하지 않습니다.
- 기본 legacy 경로를 사용하는 경우 startup migration이 본문을 바꾸기 전에 검사합니다. 현재 사용자 저장 경로와 무관한 migration 실패를 모두 차단하는 정책으로 확대하지 않습니다.
- 저장된 legacy의 금액과 기간·기한(`remainingMonths`/`termMonths`, `targetMonth`/`dueMonth`)은 명시된 원본값으로 검증합니다. 잘못된 값은 기본값이나 기한 생략으로 감추지 않으며, 원본 필드가 있으면 별칭보다 우선합니다. 두 필드가 모두 생략된 경우의 기존 기본값·선택값 계약은 유지합니다.
- 정상 v1의 월 상환액은 `minimumPayment` → `minimumPaymentKrw` → `monthlyPaymentKrw` → `monthlyPayment` 우선순위로 보존합니다. 모두 생략된 경우에만 기존 추정 상환액을 사용합니다. 저장된 우선 필드의 문자열·null·음수는 오류로 처리하며, 추정값이나 후순위 별칭으로 감춘 뒤 migration·Vault rewrite하지 않습니다.
- `debts`가 미지정이고 `liabilities`가 배열이면 해당 부채를 이전합니다. 기존 `debts` 배열은 빈 배열이어도 우선합니다. 지원 v1 fixture의 원금·APR·기간·월 상환액·목표 데이터를 함께 검증하며, 확인하지 않은 다른 legacy 형식까지 무손실 호환성을 보장하지는 않습니다.
- 프로필 store의 사전 검사와 개별 atomic write를 여러 파일 전체의 트랜잭션으로 확대하지 않습니다. 지원 Desktop Local과 공식 writer script의 cross-process lease 경계를 유지합니다. 사용자 백업의 replace 복원은 기존 검증·rollback 계약을 따르며, 이 프로필 저장 설명을 백업 전체의 부분 실패 계약으로 해석하지 않습니다.

## Planning 백업 포함 정책
- 사용자 백업(`/settings/backup`, vault format v2)
  - 현재 사용자 profile/run/blob/action 데이터
  - 현재 사용자 Planning v3의 13개 owner: accounts, opening-balances, batches, drafts, category-rules, transaction-overrides, news, alerts, journal, exposure, csv-drafts, routines, scenario-overrides
  - runtime-shared assumptions, ops policy, indicators, legacy-transactions는 포함하지 않음
  - `merge`에서는 raw Planning v3 파일을 덮어쓰지 않고 건너뜀. `replace`에서만 미리보기로 검증한 13개 owner를 같은 사용자 namespace에 교체 복원
  - delta는 profile/run 계열 변경분만 포함하며 Planning v3를 포함하지 않음
- Ops 백업(`/ops/backup`)
  - profile/run/blob/action 데이터와 runtime-shared assumptions·ops policy
  - namespace 모드의 full 백업은 현재 사용자 Planning v3 13개 owner도 포함
- A. 필수(재현성/사용자 데이터)
  - `.data/planning/profiles/*.json`
  - `.data/planning/runs/*.json`
- B. 선택(성능/진단, 누락되어도 복구 가능)
  - `.data/planning/cache/*.json`
  - `.data/planning/eval/latest.json`
  - `.data/planning/eval/history/*.json`
- 제외(공유용 산출물, 백업/export/import/restore 비포함 원칙)
  - `.data/planning/share/*.md`
  - `.data/planning/share/*.meta.json`
- 이전 vault format v1은 읽을 수 있지만 Planning v3가 포함되지 않았다는 경고를 표시합니다.

## 화면 섹션
1. Assumptions Snapshot Status
   - latest snapshot id/asOf/fetchedAt/missing/warnings/sources
   - staleDays(45일 warn, 120일 critical)
   - 주요 금리/물가 지표 + history count
   - `Sync snapshot now` 버튼(기존 `/api/ops/assumptions/sync` 재사용)
   - 상세 작업: `/ops/assumptions`, `/ops/assumptions/history`
   - 롤백(set latest): history 화면에서 `SET_LATEST {snapshotId}` confirm 필요
2. Regression Status
   - `.data/planning/eval/latest.json` 기반 pass/fail 요약
   - 실패 상위 5개 케이스 요약
   - `Copy CLI command`로 `pnpm planning:v2:regress` 복사
   - 상세 리포트: `/ops/planning-eval`
3. Cache Status
   - planning cache total/byKind + hitRate
   - `Purge expired` 버튼(기존 `/api/ops/planning-cache/purge` 재사용)
   - 상세 페이지: `/ops/planning-cache`
4. Store Status
   - profile/run 레코드 개수
   - profiles+runs 디렉토리 기준 대략 용량
   - `Run Planning Doctor`로 무결성 검사 실행 (strict 옵션 지원)

## 보안/운영 가드
- Sync/Purge는 기존 route의 local-only + same-origin + dev unlock + csrf 가드를 그대로 사용합니다.
- purge 실행 시 audit log 이벤트 `PLANNING_CACHE_PURGE`가 기록됩니다.
- Vault 암호화:
  - 설정 화면: `/ops/security`
  - 설정 후 저장 데이터(profile/run/assumptions/action)는 at-rest 암호화(envelope)로 저장됩니다.
  - 서버 재시작 후 vault는 잠김 상태로 시작하며, `/ops/security` 또는 잠금 화면에서 암호를 입력해 unlock 해야 합니다.
- export/evidence bundle은 문서/게이트 로그 중심으로만 구성하며, `.data/planning/profiles` 및 `.data/planning/runs` 원문 JSON은 포함하지 않습니다.
- planning v2 운영 로그(`complete/ops:run/release/evidence/final-report`)는 민감정보 마스킹(`Bearer`, API 키/토큰, `.data/...` 경로, 큰 금액 숫자) 적용 후 저장합니다.

## 자동 운영(Ops Run)
- 스케줄러 복붙 템플릿: [planning-v2-scheduler.md](./planning-v2-scheduler.md)
- 유지보수 체크리스트: [planning-v2-maintenance.md](./planning-v2-maintenance.md)
- 장애 보고 템플릿: [planning-v2-bug-report-template.md](./planning-v2-bug-report-template.md)
- 월간 로컬 CLI(서버 cron 없음):
  - `pnpm ops:refresh-assumptions`
  - `pnpm planning:run:monthly`
  - `planning:run:monthly`는 기본 profile + latest snapshot으로 run 생성, retention 정책(`defaultKeepCount`)을 적용합니다.
  - Vault가 잠겨 있으면 두 명령 모두 즉시 실패(`code=LOCKED`, exit code 2)하며 `/ops/security` unlock이 필요합니다.
  - 실행 결과는 `/ops/metrics`의 `SCHEDULED_TASK` 이벤트로 기록됩니다.
- 주간 운영(권장: 일요일 오전):
  - `pnpm planning:v2:ops:safety:weekly`
  - 기본 순서: doctor -> 조건부 assumptions sync -> complete
  - legacy run 백필 후보를 함께 점검하며, 후보가 1건 이상이면 FAIL 처리합니다.
- 운영 안전성 게이트(기본):
  - `pnpm planning:v2:ops:safety`
  - `ops:run` 실행 후 legacy run 백필 후보를 자동 점검합니다.
  - 운영 기본 임계치: `legacy-fail-threshold=0` (후보 0건 유지)
  - safety 리포트에는 `operatingEnvironment`와 `topology`가 포함됩니다. `DATABASE_URL`은 원문 대신 provider만 기록하고, 파일 저장 완료 보장은 `process-local` 범위로만 표기합니다.
  - 즉시 백필 적용: `pnpm planning:v2:ops:safety -- --legacy-mode=apply --confirm="BACKFILL LEGACY RUNS"`
  - apply 모드는 백필 전 후보와 적용 결과를 모두 기록하고, 적용 후 `postApplyCandidateCount`가 임계치 이하일 때만 통과합니다.
- 격주/월간 또는 업데이트 후 운영:
  - `pnpm planning:v2:ops:safety:regress`
- 보관 정책 정리:
  - `pnpm planning:v2:ops:prune --keep=50`
- 마이그레이션 점검(선택):
  - `pnpm planning:v2:migrate:dry`
- 조건부 스냅샷 동기화:
  - snapshot 없음 또는 `fetchedAt` 기준 45일 초과 시에만 `planning:assumptions:sync` 시도
  - sync 실패는 WARN으로 기록하고 complete 게이트는 계속 진행
- 실행 리포트/로그:
  - `.data/planning/ops/reports/{YYYYMMDD-HHmmss}.json`
  - `.data/planning/ops/logs/{YYYYMMDD-HHmmss}.log`
  - 실제 운영 topology 확인이 필요하면 production 환경에서 동일 명령을 실행한 뒤 리포트의 `operatingEnvironment.storageMode`, `operatingEnvironment.dataDir`, `topology.writeSerializationScope`, `topology.sharedFileStoreCompletion`을 최종 보고서에 첨부합니다.

## Planning Cleanup (Retention)
- 화면: `/ops/planning-cleanup`
- 기본 정책:
  - `runs.keepPerProfile=50`
  - `cache.keepDays=7`
  - `opsReports.keepCount=50`
  - `assumptionsHistory.keepCount=200`
  - `trash.keepDays=30`
- 절차:
  1. target 선택
  2. `Dry Run` 실행(삭제 예정 건수/용량/샘플 확인)
  3. 확인 문구 `CLEANUP {target} {deleteCount}` 입력
  4. `Apply` 실행
- 보안:
  - local-only + same-origin + dev unlock + csrf 검증
  - dry-run/apply 모두 audit log 이벤트 기록
- 주의:
  - 적용 후 되돌릴 수 없습니다.
  - 정리 전 backup/export를 권장합니다.

## Planning Trash (Soft Delete)
- 화면: `/planning/trash`
- 경로:
  - `.data/planning/trash/profiles/{id}.json`
  - `.data/planning/trash/runs/{id}.json`
  - `.data/planning/trash/reports/{id}.md` (+ `.meta.json`)
- 동작:
  1. profiles/runs/reports 삭제는 기본적으로 휴지통 이동(soft delete)
  2. 휴지통에서 restore / delete permanently / empty trash 실행
  3. 모든 작업은 confirm 문자열 입력이 필요
- 감사로그 이벤트:
  - `PLANNING_TRASH_MOVE`
  - `PLANNING_TRASH_RESTORE`
  - `PLANNING_TRASH_PURGE`

## 데이터 마이그레이션
- 목적:
  - 저장 스키마(versioned JSON) 변경 시 안전하게 업그레이드
- 경로:
  - profiles: `.data/planning/profiles/*.json`
  - runs: `.data/planning/runs/*.json`
  - snapshots: `.data/planning/assumptions.latest.json`, `.data/planning/assumptions/history/*.json`
- 절차:
  1. dry-run: `pnpm planning:v2:migrate:dry`
  2. apply: `pnpm planning:v2:migrate:apply`
     - confirm 문자열: `MIGRATE PLANNING V2`
  3. 결과 확인: changed/failed 건수, audit log 이벤트 확인
- 안전장치:
  - 파일별 `.bak` 백업 생성
  - 원자 저장(`tmp -> rename`)
  - apply 전 restore point 생성 시도
- 실패/롤백:
  - 해당 파일의 `{name}.json.bak`를 원본 파일명으로 복원
  - 복원 후 `pnpm planning:v2:doctor -- --strict` 재검증 권장

### 스케줄러에 붙이는 방법(예시, Asia/Seoul)
- Windows 작업 스케줄러:
  - Program/script: `cmd.exe`
  - Add arguments: `/c cd /d C:\path\to\finance && pnpm planning:v2:ops:safety:weekly`
  - Trigger: 매주 1회(또는 매월 1회), 시간대 `Korea Standard Time`
- macOS launchd(명령 예시):
  - `cd /path/to/finance && pnpm planning:v2:ops:safety:weekly`
- Linux cron(명령 예시):
  - `CRON_TZ=Asia/Seoul`
  - `0 9 * * 1 cd /path/to/finance && pnpm planning:v2:ops:safety:weekly >> .data/planning/ops/cron.log 2>&1`

## 운영 런북

### Planning report P4 관찰 키트
- 주간 보고 문안, P4 관찰 로그, fallback `source_key` 표준, strict-first PR 템플릿은 [planning-report-p4-observation-kit.md](./planning-report-p4-observation-kit.md)에 모아둡니다.
- `/ops/metrics`의 Planning fallback usage는 총량 카드로 보고, source별 세부 분류는 summary API 또는 위 키트 기준으로 기록합니다.
- 남은 legacy run 정리용 dry-run/apply는 `pnpm planning:v2:backfill-legacy-runs`를 사용합니다.

### 1) Snapshot 동기화/롤백
1. `/ops/assumptions`에서 `Sync now` 실행
2. 경고가 있으면 `warnings`와 source를 확인
3. 문제 발생 시 `/ops/assumptions/history`에서 이전 snapshot을 선택 후 `Set as latest`
   - confirm 문자열 필요

### 1-1) 스케줄 실행 상태 점검
1. `/ops/metrics`에서 `type=SCHEDULED_TASK` 필터를 선택
2. `taskName=OPS_REFRESH_ASSUMPTIONS` / `PLANNING_RUN_MONTHLY` 성공/실패를 확인
3. `/ops/doctor`의 `Scheduled monthly run failures` 경고가 뜨면 최근 실패 코드(LOCKED/STALE/INTERNAL)를 확인

### 2) Regression 점검
1. `pnpm planning:v2:regress` 실행
2. `/ops/planning` 또는 `/ops/planning-eval`에서 FAIL 케이스 확인
3. 원칙: 코드 수정 없이 baseline 자동 업데이트 금지
4. 수정 후 다시 regress 실행

### 2-1) 보안/누출 가드 점검
1. `pnpm planning:v2:guard` 실행
2. client 코드의 민감 env 참조/내부 경로 문자열 노출 여부를 확인
3. planning API 응답 코드에서 `sources.url`/`.data` 패턴이 감지되면 수정 후 재실행

### 3) Cache 운영
1. `/ops/planning` 또는 `/ops/planning-cache`에서 entry/hitRate 확인
2. 폭증/오염 의심 시 `Purge expired` 실행
3. 필요 시 retention/캐시 정책 점검

### 4) Backup/Import/Restore
1. `/ops/backup`에서 Full/Delta export를 선택해 실행
2. Delta 정책(결정적): `runId` 충돌 시 `skip`, `snapshotId` 충돌 시 `skip`
3. Import 후 `/ops/planning`에서 Planning Doctor 실행
4. 문제 시 restore point rollback 실행 후 doctor 재확인

### 5) 업데이트/복구 절차 (고정)
1. 업데이트 전:
   - export/restore point 생성
   - `pnpm planning:v2:complete` 통과 확인
2. 업데이트 후:
   - `pnpm planning:v2:regress` 실행
   - FAIL 시 baseline 자동 갱신 금지, 원인 수정 또는 롤백
3. 문제 발생 시:
   - restore point apply
   - `/ops/assumptions/history`에서 snapshot latest 롤백
   - `pnpm planning:v2:ops:prune` 또는 `/ops/planning-cache` purge 실행

## Import/Restore 후 무결성 확인
1. `/ops/planning`의 `Run Planning Doctor` 실행
2. `missing / invalidJson / optionalMissing` 항목 확인
3. 필요 시 strict 모드로 다시 실행하거나, CLI에서 `pnpm planning:v2:doctor -- --strict` 실행

## 사고 대응 가이드
- 스냅샷 파싱/ECOS 실패:
  - assumptions warnings 확인
  - fallback 동작 여부 확인
  - 필요 시 수동으로 이전 snapshot을 latest로 롤백
- ops run에서 snapshot sync 실패:
  - 리포트의 `snapshot.syncResult`/steps note 확인
  - 기존 latest snapshot 유지 상태에서 complete 결과를 우선 확인
- regression FAIL:
  - baseline 업데이트 전에 반드시 diff 원인 분석
  - 의도치 않은 변경이면 코드 롤백/수정
- complete FAIL:
  - report steps에서 실패한 게이트(`guard`/`smoke`/`test` 등) 확인 후 수정
- cache 급증:
  - purge 후 재측정
  - 반복 발생 시 호출 패턴/TTL/옵션 키 확인

## 감사로그 이벤트
- `BACKUP_EXPORT`
- `BACKUP_IMPORT`
- `RESTORE_POINT_CREATE`
- `RESTORE_POINT_APPLY`
- `PLANNING_DOCTOR_RUN`

## 가족용 모드(옵션)
- 이 절은 legacy migration·개발 검증용 namespace 골격입니다. 현재 production
  deployment는 `desktop-local` 한 사용자 모드만 지원하며 가족/팀 web 배포로
  사용하지 않습니다.
- 사용자 네임스페이스 분리:
  - `PLANNING_NAMESPACE_ENABLED=true`
  - `PLANNING_USER_ID=family-a` (예시)
  - 저장 경로: `.data/planning/users/{userId}/profiles|runs`
- 지원 production launcher는 `PLANNING_NAMESPACE_ENABLED=false`와
  `PLANNING_SINGLE_USER_MODE=true`를 강제하며 저장 경로는
  `users/default/...`로 수렴합니다.
- namespace 이동 마이그레이션:
  - dry-run: `pnpm planning:v2:migrate:dry -- --namespace-user=family-a`
  - apply: `pnpm planning:v2:migrate:apply -- --namespace-user=family-a`
- 저장 암호화(옵션):
  - `PLANNING_ENCRYPTION_ENABLED=true`
  - `PLANNING_ENCRYPTION_PASSPHRASE=...`
  - namespace apply 시 암호화까지 적용:
    - `pnpm planning:v2:migrate:apply -- --namespace-user=family-a --encrypt`
- 주의:
  - PIN/패스프레이즈 분실 시 복구가 어려울 수 있습니다.
  - 적용 전 backup/restore point 생성 권장.
  - migration/ops writer는 Desktop 앱을 종료한 뒤 공식 `pnpm` script로 실행합니다.
