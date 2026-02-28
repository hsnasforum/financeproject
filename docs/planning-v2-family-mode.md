# Planning v2 가족용 모드(옵션)

## 목적
- 기본 개인용 로컬 모드를 유지하면서, 가족/소규모 팀에서 사용자별 데이터 분리를 지원합니다.

## 동작 방식
- 네임스페이스 분리(옵션):
  - `PLANNING_NAMESPACE_ENABLED=true`
  - `PLANNING_USER_ID={userId}`
  - profiles/runs 저장 경로가 `.data/planning/users/{userId}/...`로 분리됩니다.
- 공통 데이터:
  - assumptions snapshot/latest/history는 기존 공용 경로를 그대로 사용합니다.

## 로컬 계정(PIN) 개요
- 사용자 인덱스 파일: `.data/planning/users/index.json`
- PIN 평문 저장 금지:
  - PBKDF2 hash/salt/iterations만 저장합니다.
- PIN 검증 유틸:
  - `src/lib/planning/auth/localAuth.ts`

## 저장 암호화(옵션)
- `PLANNING_ENCRYPTION_ENABLED=true`
- `PLANNING_ENCRYPTION_PASSPHRASE=...`
- 저장 포맷:
  - `{ version, alg, kdf, iterations, digest, salt, iv, tag, ciphertext }`
- 알고리즘:
  - AES-256-GCM + PBKDF2

## 마이그레이션 경로
- dry-run:
  - `pnpm planning:v2:migrate:dry -- --namespace-user=family-a`
- apply:
  - `pnpm planning:v2:migrate:apply -- --namespace-user=family-a`
- namespace 이동 + 암호화 적용:
  - `pnpm planning:v2:migrate:apply -- --namespace-user=family-a --encrypt`

## 주의/제약
- PIN/패스프레이즈 분실 시 복구가 어려울 수 있습니다.
- 이 모드는 공개 서비스용 권한 체계가 아니라 로컬 확장 골격입니다.
