# Finance Project Release Notes (1.0.5)

- Version: `1.0.5`
- Release date: `2026-08-02`
- Base release: `v1.0.4`
- 변경 기준: `v1.0.4` 이후 `main`의 400개 변경 커밋과 `v1.0.5` 릴리즈 준비 변경
- 상태: `공식 누적 릴리즈 문서`

`v1.0.5`는 `v1.0.4` 이후 오랫동안 누적된 변경을 현재 `main` 기준으로 정리한 catch-up 릴리즈입니다. 과거 커밋에 여러 태그를 소급 생성하지 않고, 검증된 현재 소스에 `v1.0.5` 태그 하나만 발행합니다.

## 주요 변경

- Planning 결과에서 추천 실행으로 넘어가는 CTA와 action context를 연결하고, 추천 이력과 저장된 리포트 사이의 양방향 이동 경로를 추가했습니다.
- Planning v3의 canonical entity, batch·draft·report·news·ops 계약과 controller/view 책임을 정리했습니다.
- Planning v2·v3, 뉴스, 제품 후보 데이터를 사용자별 namespace로 분리하고 production route auth와 Auth.js adapter 활성화 조건을 강화했습니다.
- run 저장·create-run·startup migration·legacy backfill을 작은 경계로 나누고 관측, 재시도, cache invalidation과 원자적 restore를 보강했습니다.
- FINLIFE refresh를 canonical 저장소에 영속화하고 완료 증거, 부분 실패, inventory drift와 기준 시점을 구분해 표시했습니다.
- owner별 backup manifest, 암호화 archive preview, restore transaction과 doctor를 추가했습니다.
- 모바일 내비게이션, 버튼 대비, 단일 `<main>`, 수동 carousel, 공통 오류 복구와 route registry의 fail-closed 검증을 강화했습니다.
- tag·package version·기본 브랜치 SHA·desktop artifact checksum이 일치해야만 GitHub Release를 생성하도록 provenance gate를 추가하고, dependency audit를 npm Bulk Advisory API에 맞췄습니다.

## 회고 구간

변경 흐름을 쉽게 검토할 수 있도록 400개 커밋을 기능 완료 지점별로 나눈 참고 문서를 함께 제공합니다.

| 회고 구간 | 커밋 범위 | 커밋 수 | 주요 내용 |
|---|---|---:|---|
| 초기 연결 구간 | `630f4c5f..05c3990c` | 49 | Planning→추천 연결, freshness·trust 안내 |
| `v1.1.0` 계획 참고 | `05c3990c..3de12780` | 119 | Planning v3 계약, UI 책임 분리, CSP·검증 |
| `v1.2.0` 계획 참고 | `3de12780..e82f57ea` | 86 | 인증·사용자별 저장 격리, 서비스 경계 |
| `v1.3.0` 계획 참고 | `e82f57ea..8c118d58` | 83 | run·migration 구조, FINLIFE 영속화 |
| `v1.4.0` 계획 참고 | `8c118d58..5e15a1ae` | 63 | 백업·복원, 접근성, release provenance |

이 표의 `v1.1.0`~`v1.4.0`은 이미 게시된 태그가 아니라 회고용 구간명입니다. 해당 버전의 실제 릴리즈는 `v1.0.5` 이후 새 변경분을 기준으로 순차 작성합니다.

### 단계별 회고 노트

아래 문서는 실제 태그·GitHub Release가 아니라, `v1.0.5`에 이미 포함된 변경을 검토하기 위한 상세 구간 노트입니다.

- [`v1.1.0` 회고 구간 노트](https://github.com/hsnasforum/financeproject/blob/main/docs/releases/financeproject-1.1.0.md)
- [`v1.2.0` 회고 구간 노트](https://github.com/hsnasforum/financeproject/blob/main/docs/releases/financeproject-1.2.0.md)
- [`v1.3.0` 회고 구간 노트](https://github.com/hsnasforum/financeproject/blob/main/docs/releases/financeproject-1.3.0.md)
- [`v1.4.0` 회고 구간 노트](https://github.com/hsnasforum/financeproject/blob/main/docs/releases/financeproject-1.4.0.md)

## 보안·개인정보

- 사용자별 저장 namespace, route auth coverage와 fail-closed production 설정을 확대했습니다.
- backup·restore에는 owner manifest, checksum, 암호화 archive와 transaction 경계를 적용했습니다.
- migration·backfill·운영 telemetry에는 사용자 금융 원문을 포함하지 않습니다.
- 릴리즈 게시 권한은 검증·패키징과 게시 job으로 분리하고 기존 Release 덮어쓰기를 차단합니다.
- 2026년 7월 이후 공개된 권고 31건에 대응해 Auth.js(`next-auth 5.0.0-beta.32`, `@auth/core 0.41.3`), Next.js(`16.2.12`), Prisma(`7.9.1`)와 관련 전이 의존성을 수정 버전으로 갱신했습니다.
- 갱신된 lockfile 전체를 npm Bulk Advisory API로 다시 검사해 공개 권고가 남지 않은 상태를 릴리즈 게이트에서 확인합니다.

## 알려진 제한

- Planning v3 owner restore의 `--apply`는 안전한 운영 계약이 확정될 때까지 비활성입니다.
- 실제 OAuth provider, reverse proxy와 populated PostgreSQL 환경은 배포 환경에서 별도 검증해야 합니다.
- 외부 데이터 기준 시점과 완주율은 upstream 상태와 동기화 설정에 영향을 받습니다.
- 과거 저장 데이터에는 새 추천·리포트 연결 reference가 없을 수 있습니다.

## 업그레이드 메모

- 패키지 버전과 Planning v2 릴리즈 스크립트 기본 버전을 `1.0.5`로 맞췄습니다.
- 릴리즈 태그는 병합된 원격 `main`의 검증된 커밋에만 생성합니다.
- desktop artifact는 GitHub Actions에서 다시 빌드하며 source SHA와 checksum을 manifest로 검증합니다.
