# Finance Project v1.4.0 — 회고 공개 릴리즈

> 이 태그와 GitHub Release는 실제 게시 대상입니다.
> 신규 제품 기능은 없으며, 아래 역사 기능 구간은 모두 `v1.0.5`에 이미 포함됐습니다.

- Version: `1.4.0`
- Release date: `2026-08-02`
- 실제 base tag: `v1.3.0`
- 기능 배포 기준선: `v1.0.5`
- 회고 기준일: `2026-07-12`
- 역사 기능 구간: `8c118d58d1301bf00928bfa32b6302b0350f2dd6..5e15a1aedf5d970269cd6f263d5006f62bec937b`
- 역사 구간 커밋 수: `63`
- 상태: `공식 회고 공개 릴리즈 — 신규 기능 없음`

## 실제 태그 변경

- `v1.3.0...v1.4.0`의 제품 기능 delta는 없습니다.
- 패키지 버전, Planning v2 릴리즈 스크립트의 기본 버전과 릴리즈 문서를 `1.4.0`에 맞췄습니다.
- [실제 태그 비교: `v1.3.0...v1.4.0`](https://github.com/hsnasforum/financeproject/compare/v1.3.0...v1.4.0)

## 이미 v1.0.5에 포함된 역사 기능

- Planning owner registry, backup manifest, 암호화 archive preview, restore transaction과 registry-wide doctor를 추가했습니다.
- Planning v3 override store의 동시성·원자성과 한 번의 실행에서 하나의 run만 저장하는 경계를 강화했습니다.
- 모바일 내비게이션, 버튼 대비, 단일 `<main>`, 수동 carousel과 공통 오류 복구를 개선했습니다.
- 분류되지 않은 route와 component의 App Router 역방향 의존을 fail-closed로 차단했습니다.
- tag·package version·source SHA·artifact checksum을 연결하는 release provenance와 기존 Release 덮어쓰기 방지를 추가했습니다.
- [역사 SHA 비교: `8c118d58...5e15a1ae`](https://github.com/hsnasforum/financeproject/compare/8c118d58d1301bf00928bfa32b6302b0350f2dd6...5e15a1aedf5d970269cd6f263d5006f62bec937b)

보존용 회고 노트: [financeproject-1.4.0.md](./retrospectives/financeproject-1.4.0.md)

## 알려진 제한

- Planning v3 owner restore의 `--apply`는 안전한 운영 합의가 끝날 때까지 비활성입니다.
- protected `v*` tag/ruleset과 GitHub Actions 가용성은 저장소 운영 설정에서 별도 확인해야 합니다.
- 첨부 자산은 역사 구간 끝 SHA의 과거 바이너리가 아니라 실제 `v1.4.0` 태그 커밋에서 다시 빌드한 자산입니다.
- 사용자 기능, API, 데이터 계약, 런타임 로직 및 의존성 변경은 없습니다.
