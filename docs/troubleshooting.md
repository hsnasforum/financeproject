# Planning v2 Troubleshooting

운영 API 에러는 아래 공통 형태를 사용합니다.

```json
{
  "ok": false,
  "error": {
    "code": "CSRF",
    "message": "요청이 차단되었습니다(CSRF). 페이지를 새로고침 후 다시 시도하세요.",
    "fixHref": "/ops/security",
    "details": {}
  }
}
```

## Error Taxonomy

- `LOCKED`: Vault가 잠겨 있거나 잠금 해제 시도 제한(backoff) 상태
- `CSRF`: CSRF 토큰 누락/불일치
- `LOCAL_ONLY`: 로컬 환경이 아닌 요청
- `VALIDATION`: 입력값/확인문구/필수 파라미터 오류
- `STALE_ASSUMPTIONS`: 가정 스냅샷이 기준보다 오래됨
- `STORAGE_CORRUPT`: 저장 데이터 손상 의심
- `BACKUP_INVALID`: 백업 파일 포맷/매니페스트/암호 해제 오류

## UI Fix Links

- `LOCKED` -> `/ops/security`
- `STALE_ASSUMPTIONS` -> `/ops/assumptions`
- `STORAGE_CORRUPT` -> `/ops/doctor`
- `BACKUP_INVALID` -> `/ops/backup`

## Symptoms -> Checks -> Fix

## /ops/doctor 체크 미러

- migrations: pending/deferred/failed 마이그레이션 상태
  - Fix: `/ops/doctor`에서 `Run migrations` 실행
  - Vault 잠금 상태로 deferred면 `/ops/security`에서 unlock 후 재실행
- assumptions-freshness: latest snapshot 존재 + staleDays 임계치 확인
  - Fix: `/ops/assumptions`에서 Refresh 실행
- recent-success-run: 최근 N일 내 성공 run 존재 여부
  - Fix: `/planning`에서 실행 후 저장, `/ops/runs`에서 상태 확인
- scheduled-run-failures: 월간 스케줄 실행 실패 반복 여부(`SCHEDULED_TASK`)
  - Fix: `/ops/metrics`에서 실패 코드(LOCKED/STALE_ASSUMPTIONS/INTERNAL) 확인 후 조치
- profile-validate: profile migrate->normalize->validate 통과 여부
  - Fix: `/planning`에서 profile 저장 재시도
- run-store-rw: run 저장소 read/write probe
  - Fix: `/ops/runs`에서 정리(cleanup) 후 재시도
- storage-consistency: run index/blob/envelope 정합성
  - Fix: `/ops/doctor`의 Repair index / Cleanup orphan blobs
- required-envs: 필수 env 존재 여부
  - Fix: `.env.local` 보완 후 서버 재시작

### 1) `LOCKED` (HTTP 423)
- 증상: 백업 Export/복원/보안 작업이 423으로 실패
- 확인:
  - `/ops/security`에서 Vault 상태 확인(locked/unlocked, backoffRemainingSeconds)
- 조치:
  - Vault를 잠금 해제 후 재시도
  - backoff가 걸린 경우 남은 시간 이후 재시도
  - API `error.fixHref`가 있으면 해당 링크(`/ops/security`) 우선 이동
  - 로컬 스케줄러 CLI(`ops:refresh-assumptions`, `planning:run:monthly`)는 `code=LOCKED`, exit code `2`로 종료

### 2) `CSRF` (HTTP 403)
- 증상: POST/PATCH/DELETE 호출이 403
- 확인:
  - 브라우저 새로고침 후 다시 호출
  - 요청에 csrf 필드가 포함되어 있는지 확인
- 조치:
  - `/ops/security` 또는 해당 화면 재접속으로 최신 CSRF 쿠키/토큰 재발급

### 3) `LOCAL_ONLY` (HTTP 403)
- 증상: /ops 또는 /api/ops 호출이 403
- 확인:
  - Host/Origin이 localhost(또는 loopback)인지 확인
- 조치:
  - 로컬 환경에서만 실행
  - 프록시/원격 포워딩 사용 시 loopback 설정 확인

### 4) `BACKUP_INVALID` (HTTP 400)
- 증상: 백업 Preview/Restore가 400으로 실패
- 확인:
  - 파일이 암호화 백업(`*.enc.json`)인지 확인
  - 입력 암호(passphrase) 확인
  - 파일 손상 여부 확인
- 조치:
  - `/ops/backup`에서 다시 Export한 최신 파일로 재시도
  - 암호가 맞는지 재확인
  - API `error.fixHref`(`/ops/backup`)로 이동해 재시도

### 5) `STALE_ASSUMPTIONS`
- 증상: 실행 결과 신뢰도 저하 경고
- 확인:
  - `/ops/assumptions`에서 latest snapshot staleDays 확인
- 조치:
  - `/ops/assumptions`에서 Refresh 실행 후 다시 Run
  - API `error.fixHref`(`/ops/assumptions`) 사용

### 6) `STORAGE_CORRUPT`
- 증상: 특정 데이터 로드/복원 시 반복 실패
- 확인:
  - `/ops/doctor`에서 저장소 체크 FAIL 여부 확인
  - `/ops/audit`에서 최근 오류 이벤트 확인
- 조치:
  - 최근 백업으로 `/ops/backup` Restore(merge/replace 선택)
  - 필요 시 `/ops/security` reset flow로 초기화 후 복원
  - API `error.fixHref`(`/ops/doctor`)로 이동해 repair 액션 먼저 실행

### 7) `MIGRATION_FAILED`
- 증상: `/ops/doctor`의 migrations 체크가 FAIL
- 확인:
  - migrationState(`.data/planning/migrations/migrationState.json`)의 `lastError` 확인
- 조치:
  - `/ops/doctor`에서 `Run migrations` 실행
  - `LOCKED`로 deferred면 `/ops/security` unlock 후 다시 실행

## Quick Links

- `/ops/security`
- `/ops/backup`
- `/ops/doctor`
- `/ops/assumptions`
- `/ops/audit`
