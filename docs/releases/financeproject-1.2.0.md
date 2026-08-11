# Finance Project v1.2.0 — 회고 공개 릴리즈

> 이 태그와 GitHub Release는 실제 게시 대상입니다.
> 신규 제품 기능은 없으며, 아래 역사 기능 구간은 모두 `v1.0.5`에 이미 포함됐습니다.

- Version: `1.2.0`
- Release date: `2026-08-02`
- 실제 base tag: `v1.1.0`
- 기능 배포 기준선: `v1.0.5`
- 회고 기준일: `2026-06-23`
- 역사 기능 구간: `3de12780b0260a81363e636a3b6cdb4c10e56c94..e82f57eab11504a943babce70f1c51ae18cf84bd`
- 역사 구간 커밋 수: `86`
- 상태: `공식 회고 공개 릴리즈 — 신규 기능 없음`

## 실제 태그 변경

- `v1.1.0...v1.2.0`의 제품 기능 delta는 없습니다.
- 패키지 버전, Planning v2 릴리즈 스크립트의 기본 버전과 릴리즈 문서를 `1.2.0`에 맞췄습니다.
- [실제 태그 비교: `v1.1.0...v1.2.0`](https://github.com/hsnasforum/financeproject/compare/v1.1.0...v1.2.0)

## 이미 v1.0.5에 포함된 역사 기능

- Planning v3 계정·잔액·거래·batch·override·category rule·profile draft와 뉴스 상태를 사용자별 namespace로 분리했습니다.
- browser storage inventory와 route auth coverage guard를 추가하고 production의 잘못된 auth fallback을 차단했습니다.
- Auth.js Prisma adapter는 명시적으로 설정했을 때만 활성화하도록 변경했습니다.
- Planning v2·ops·DART 핵심 처리를 route에서 service boundary로 이동했습니다.
- public source의 daily refresh와 strict freshness, PostgreSQL 전환 readiness 게이트를 추가했습니다.
- [역사 SHA 비교: `3de12780...e82f57ea`](https://github.com/hsnasforum/financeproject/compare/3de12780b0260a81363e636a3b6cdb4c10e56c94...e82f57eab11504a943babce70f1c51ae18cf84bd)

보존용 회고 노트: [financeproject-1.2.0.md](./retrospectives/financeproject-1.2.0.md)

## 알려진 제한

- 실제 OAuth provider, reverse proxy와 populated PostgreSQL 환경은 배포 환경에서 별도 검증해야 합니다.
- 외부 source의 부분 성공은 최신 데이터 전체 확보를 의미하지 않습니다.
- 첨부 자산은 역사 구간 끝 SHA의 과거 바이너리가 아니라 실제 `v1.2.0` 태그 커밋에서 다시 빌드한 자산입니다.
- 사용자 기능, API, 데이터 계약, 런타임 로직 및 의존성 변경은 없습니다.
