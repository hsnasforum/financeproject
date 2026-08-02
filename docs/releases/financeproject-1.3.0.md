# Finance Project v1.3.0 — 회고 공개 릴리즈

> 이 태그와 GitHub Release는 실제 게시 대상입니다.
> 신규 제품 기능은 없으며, 아래 역사 기능 구간은 모두 `v1.0.5`에 이미 포함됐습니다.

- Version: `1.3.0`
- Release date: `2026-08-02`
- 실제 base tag: `v1.2.0`
- 기능 배포 기준선: `v1.0.5`
- 회고 기준일: `2026-07-10`
- 역사 기능 구간: `e82f57eab11504a943babce70f1c51ae18cf84bd..8c118d58d1301bf00928bfa32b6302b0350f2dd6`
- 역사 구간 커밋 수: `83`
- 상태: `공식 회고 공개 릴리즈 — 신규 기능 없음`

## 실제 태그 변경

- `v1.2.0...v1.3.0`의 제품 기능 delta는 없습니다.
- 패키지 버전, Planning v2 릴리즈 스크립트의 기본 버전과 릴리즈 문서를 `1.3.0`에 맞췄습니다.
- [실제 태그 비교: `v1.2.0...v1.3.0`](https://github.com/hsnasforum/financeproject/compare/v1.2.0...v1.3.0)

## 이미 v1.0.5에 포함된 역사 기능

- Planning run 저장을 create·read·update·delete·retention·blob·meta·legacy backfill 경계로 분리했습니다.
- startup migration에 상태 관측, 실패 재시도와 vault 변경 뒤 cache invalidation을 추가했습니다.
- create-run을 입력, persistence, stage pipeline, 응답과 side effect 경계로 나눴습니다.
- 저장 owner mode와 원자적 replace restore를 강화하고 전역 legacy transaction surface를 제거했습니다.
- FINLIFE refresh를 canonical 저장소에 영속화하고 완료 증거, 불완전 persistence와 inventory drift를 구분했습니다.
- [역사 SHA 비교: `e82f57ea...8c118d58`](https://github.com/hsnasforum/financeproject/compare/e82f57eab11504a943babce70f1c51ae18cf84bd...8c118d58d1301bf00928bfa32b6302b0350f2dd6)

보존용 회고 노트: [financeproject-1.3.0.md](./retrospectives/financeproject-1.3.0.md)

## 알려진 제한

- legacy run과 새 저장 구조가 공존하는 동안 migration·backfill 호환 경로는 유지됩니다.
- FINLIFE 최신성은 upstream 응답과 설정된 동기화 주기에 영향을 받습니다.
- 첨부 자산은 역사 구간 끝 SHA의 과거 바이너리가 아니라 실제 `v1.3.0` 태그 커밋에서 다시 빌드한 자산입니다.
- 사용자 기능, API, 데이터 계약, 런타임 로직 및 의존성 변경은 없습니다.
