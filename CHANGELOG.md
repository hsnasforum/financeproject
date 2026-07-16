# Changelog

## v1.0.5 - 2026-07-16

### Added
- Planning 결과·추천 이력·저장 리포트를 연결하는 실행 맥락과 양방향 이동 경로를 추가했습니다.
- 사용자별 Planning 저장 namespace, owner별 backup manifest·암호화 archive·restore transaction과 release artifact provenance를 추가했습니다.

### Changed
- Planning v3 데이터·서비스·화면 책임과 run·migration·FINLIFE canonical persistence 경계를 정리했습니다.
- 모바일 내비게이션, 접근성, 오류 복구, route registry와 release workflow를 fail-closed 기준으로 강화했습니다.
- dependency audit가 lockfile의 정확한 버전을 npm Bulk Advisory API에서 확인하도록 변경했습니다.

### Fixed
- 외부 데이터 부분 실패와 freshness가 성공으로 축약되거나 잘못 해석되지 않도록 상태·기준 시점 표시를 보강했습니다.
- 저장·restore·override 동시성에서 부분 기록이나 다른 사용자 데이터 혼합이 발생하지 않도록 원자성과 인증 경계를 강화했습니다.

### Notes
- `v1.0.4` 이후 누적 변경을 현재 `main` 기준으로 정리한 catch-up 릴리즈입니다.
- `v1.1.0`~`v1.4.0` 회고 문서는 변경 흐름을 설명하기 위한 참고 자료이며 해당 태그나 GitHub Release가 게시된 것은 아닙니다.
