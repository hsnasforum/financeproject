# Finance Project 회고 구간 노트 (1.4.0)

- 계획 버전: `1.4.0`
- 회고 기준일: `2026-07-12`
- Commit range: `8c118d58d1301bf00928bfa32b6302b0350f2dd6..5e15a1aedf5d970269cd6f263d5006f62bec937b`
- Commit count: `63`
- 상태: `회고 기준 문서 — 이 변경은 v1.0.5 누적 릴리즈에 포함되며 v1.4.0 tag/GitHub Release는 미생성`

## 주요 변경

- Planning owner registry, backup manifest, 암호화 archive preview, restore transaction과 registry-wide doctor를 추가했습니다.
- Planning v3 override store의 동시성·원자성과 한 번의 실행에서 하나의 run만 저장하는 경계를 강화했습니다.
- 모바일 내비게이션, 버튼 대비, 단일 `<main>`, 수동 carousel과 공통 오류 복구를 개선했습니다.
- 분류되지 않은 route와 component의 App Router 역방향 의존을 fail-closed로 차단했습니다.
- tag·package version·source SHA·artifact checksum을 연결하는 release provenance와 기존 Release 덮어쓰기 방지를 추가했습니다.

## 알려진 제한

- Planning v3 owner restore의 `--apply`는 안전한 운영 합의가 끝날 때까지 비활성입니다.
- protected `v*` tag/ruleset과 GitHub Actions 결제 상태는 저장소 운영 설정에서 별도 확인해야 합니다.
- 실제 `v1.4.0` 릴리즈 노트는 `v1.0.5` 이후 새 변경분으로 다시 작성합니다.
