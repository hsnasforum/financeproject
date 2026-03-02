# Manual Update Strategy

## Why manual update only

- 이 앱은 로컬 전용(127.0.0.1) 실행 정책을 유지합니다.
- 자동 다운로드/자동 패치는 사용하지 않습니다.
- 업데이트 전 백업과 Doctor 점검을 사용자가 직접 확인하도록 설계했습니다.

## Recommended update steps

1. 백업 실행
   - `/ops/backup`에서 export 수행
2. 코드/패키지 업데이트
   - 새 버전 설치 또는 저장소 업데이트
3. 앱 실행
   - `pnpm build && pnpm start:local`
4. 상태 점검
   - `/ops/doctor`에서 migration/health 확인
5. 이상 시 복구
   - `/ops/backup` restore 또는 `/ops/doctor` 안내에 따라 조치

## Migration guidance

- migration pending/failed 상태면 `/ops/doctor?state=MIGRATION_REQUIRED`로 안내됩니다.
- 이 단계에서는 자동 마이그레이션 실행 대신, 점검과 수동 실행(ops action)을 우선합니다.

