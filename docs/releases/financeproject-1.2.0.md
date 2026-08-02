# Finance Project 회고 구간 노트 (1.2.0)

- 계획 버전: `1.2.0`
- 회고 기준일: `2026-06-23`
- Commit range: `3de12780b0260a81363e636a3b6cdb4c10e56c94..e82f57eab11504a943babce70f1c51ae18cf84bd`
- Commit count: `86`
- 상태: `회고 기준 문서 — 이 변경은 v1.0.5 누적 릴리즈에 포함되며 v1.2.0 tag/GitHub Release는 미생성`

## 주요 변경

- Planning v3 계정·잔액·거래·batch·override·category rule·profile draft와 뉴스 상태를 사용자별 namespace로 분리했습니다.
- browser storage inventory와 route auth coverage guard를 추가하고 production의 잘못된 auth fallback을 차단했습니다.
- Auth.js Prisma adapter는 명시적으로 설정했을 때만 활성화하도록 변경했습니다.
- Planning v2·ops·DART 핵심 처리를 route에서 service boundary로 이동했습니다.
- public source의 daily refresh와 strict freshness, PostgreSQL 전환 readiness 게이트를 추가했습니다.

## 알려진 제한

- 실제 OAuth provider, reverse proxy와 populated PostgreSQL 환경은 배포 환경에서 별도 검증해야 합니다.
- 외부 source의 부분 성공은 최신 데이터 전체 확보를 의미하지 않습니다.
- 실제 `v1.2.0` 릴리즈 노트는 `v1.0.5` 이후 새 변경분으로 다시 작성합니다.
