# Finance Project 회고 구간 노트 (1.3.0)

- 계획 버전: `1.3.0`
- 회고 기준일: `2026-07-10`
- Commit range: `e82f57eab11504a943babce70f1c51ae18cf84bd..8c118d58d1301bf00928bfa32b6302b0350f2dd6`
- Commit count: `83`
- 상태: `보존용 회고 기준 문서 — 이 변경은 v1.0.5 누적 릴리즈에 포함됨`

## 주요 변경

- Planning run 저장을 create·read·update·delete·retention·blob·meta·legacy backfill 경계로 분리했습니다.
- startup migration에 상태 관측, 실패 재시도와 vault 변경 뒤 cache invalidation을 추가했습니다.
- create-run을 입력, persistence, stage pipeline, 응답과 side effect 경계로 나눴습니다.
- 저장 owner mode와 원자적 replace restore를 강화하고 전역 legacy transaction surface를 제거했습니다.
- FINLIFE refresh를 canonical 저장소에 영속화하고 완료 증거, 불완전 persistence와 inventory drift를 구분했습니다.

## 알려진 제한

- legacy run과 새 저장 구조가 공존하는 동안 migration·backfill 호환 경로는 유지됩니다.
- FINLIFE 최신성은 upstream 응답과 설정된 동기화 주기에 영향을 받습니다.
- 이 문서는 `v1.0.5`에 이미 포함된 역사 범위를 보존하며, 같은 이름의 공식 릴리즈에서 신규 기능 변경으로 재사용하지 않습니다.
