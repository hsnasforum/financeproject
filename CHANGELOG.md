# Changelog

## v1.2.0 - 2026-08-02

### Changed
- 패키지 버전과 Planning v2 릴리즈 스크립트의 기본 버전을 `1.2.0`으로 맞췄습니다.
- `v1.0.5`에 이미 포함된 두 번째 역사 구간을 공식 릴리즈 문서와 보존용 회고 문서로 분리했습니다.

### Notes
- 사용자 기능, API, 데이터 계약, 런타임 로직 및 의존성 변경은 없습니다.
- 실제 `v1.1.0...v1.2.0`의 제품 기능 delta는 없으며, `3de12780..e82f57ea`의 86개 커밋은 신규 배포가 아니라 `v1.0.5`에 이미 포함된 회고 범위입니다.
- desktop artifact는 역사 구간 끝 SHA의 과거 빌드가 아니라 `v1.2.0` 태그 커밋에서 같은 기능 소스를 다시 빌드한 결과입니다.

## v1.1.0 - 2026-08-02

### Changed
- 패키지 버전과 Planning v2 릴리즈 스크립트의 기본 버전을 `1.1.0`으로 맞췄습니다.
- `v1.0.5`에 이미 포함된 첫 번째 역사 구간을 실제 태그와 분리해 검토할 수 있도록 공식 릴리즈 문서와 보존용 회고 문서를 구분했습니다.

### Notes
- 사용자 기능, API, 데이터 계약, 런타임 로직 및 의존성 변경은 없습니다.
- 실제 `v1.0.5...v1.1.0`의 제품 기능 delta는 없으며, `05c3990c..3de12780`의 119개 커밋은 신규 배포가 아니라 `v1.0.5`에 이미 포함된 회고 범위입니다.
- desktop artifact는 역사 구간 끝 SHA의 과거 빌드가 아니라 `v1.1.0` 태그 커밋에서 같은 기능 소스를 다시 빌드한 결과입니다.

## v1.0.5 - 2026-08-02

### Added
- Planning 결과·추천 이력·저장 리포트를 연결하는 실행 맥락과 양방향 이동 경로를 추가했습니다.
- 사용자별 Planning 저장 namespace, owner별 backup manifest·암호화 archive·restore transaction과 release artifact provenance를 추가했습니다.

### Changed
- Planning v3 데이터·서비스·화면 책임과 run·migration·FINLIFE canonical persistence 경계를 정리했습니다.
- 모바일 내비게이션, 접근성, 오류 복구, route registry와 release workflow를 fail-closed 기준으로 강화했습니다.
- dependency audit가 lockfile의 정확한 버전을 npm Bulk Advisory API에서 확인하도록 변경했습니다.
- 2026년 7월 이후 공개된 보안 권고에 맞춰 Auth.js, Next.js, Prisma와 관련 전이 의존성을 수정 버전으로 갱신했습니다.

### Fixed
- 외부 데이터 부분 실패와 freshness가 성공으로 축약되거나 잘못 해석되지 않도록 상태·기준 시점 표시를 보강했습니다.
- 저장·restore·override 동시성에서 부분 기록이나 다른 사용자 데이터 혼합이 발생하지 않도록 원자성과 인증 경계를 강화했습니다.

### Notes
- `v1.0.4` 이후 누적 변경을 현재 `main` 기준으로 정리한 catch-up 릴리즈입니다.
- `v1.0.5` 게시 당시 `v1.1.0`~`v1.4.0`은 태그가 아닌 회고 구간명이었습니다. 이후 동일 기능을 신규 기능으로 재게시하지 않는 문서화 전용 릴리즈로 순차 공개할 수 있습니다.
